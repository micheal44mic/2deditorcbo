#include <stdint.h>

void *memset(void *dest, int value, unsigned long count) {
  unsigned char *out = (unsigned char *)dest;
  for (unsigned long index = 0; index < count; index += 1) {
    out[index] = (unsigned char)value;
  }
  return dest;
}

void *memcpy(void *dest, const void *src, unsigned long count) {
  unsigned char *out = (unsigned char *)dest;
  const unsigned char *in = (const unsigned char *)src;
  for (unsigned long index = 0; index < count; index += 1) {
    out[index] = in[index];
  }
  return dest;
}


#define TILE_META_STRIDE 8
#define TILE_META_X 0
#define TILE_META_Y 1
#define TILE_META_WIDTH 2
#define TILE_META_HEIGHT 3
#define TILE_META_TX 4
#define TILE_META_TY 5
#define TILE_META_PIXELS_OFFSET 6
#define TILE_META_PIXELS_LENGTH 7
#define WASM_PAGE_SIZE 65536u

extern unsigned char __heap_base;

static uint32_t heap_top = 0;
static uint32_t flood_stack_ptr = 0;
static int32_t flood_stack_capacity = 0;

static uint32_t align8(uint32_t value) {
  return (value + 7u) & ~7u;
}

static void ensure_heap_started(void) {
  if (heap_top == 0) {
    heap_top = align8((uint32_t)(uintptr_t)&__heap_base);
  }
}

static int ensure_memory(uint32_t end_offset) {
  uint32_t pages = (uint32_t)__builtin_wasm_memory_size(0);
  uint64_t current_bytes = (uint64_t)pages * WASM_PAGE_SIZE;

  if ((uint64_t)end_offset <= current_bytes) {
    return 1;
  }

  uint64_t required = (uint64_t)end_offset - current_bytes;
  uint32_t grow_pages = (uint32_t)((required + WASM_PAGE_SIZE - 1u) / WASM_PAGE_SIZE);
  int32_t previous = __builtin_wasm_memory_grow(0, grow_pages);

  return previous >= 0;
}

__attribute__((export_name("alloc")))
uint32_t pixel_core_alloc(uint32_t size) {
  ensure_heap_started();

  uint32_t aligned_size = align8(size);
  uint32_t ptr = heap_top;
  uint32_t next_top = ptr + aligned_size;

  if (next_top < ptr || !ensure_memory(next_top)) {
    return 0;
  }

  heap_top = next_top;

  return ptr;
}

__attribute__((export_name("free")))
void pixel_core_free(uint32_t ptr, uint32_t size) {
  if (ptr == 0) {
    return;
  }

  uint32_t aligned_size = align8(size);
  uint32_t expected_top = ptr + aligned_size;

  if (expected_top == heap_top) {
    heap_top = ptr;
  }
}

static int ensure_flood_stack_capacity(int32_t capacity) {
  if (capacity <= flood_stack_capacity) {
    return 1;
  }

  uint32_t bytes = (uint32_t)capacity * 4u;
  uint32_t ptr = pixel_core_alloc(bytes);

  if (ptr == 0) {
    return 0;
  }

  flood_stack_ptr = ptr;
  flood_stack_capacity = capacity;

  return 1;
}

__attribute__((export_name("reserve_stack")))
int32_t reserve_stack(int32_t capacity) {
  if (capacity < 1) {
    capacity = 1;
  }

  return ensure_flood_stack_capacity(capacity) ? 1 : 0;
}

static int32_t min_i32(int32_t a, int32_t b) {
  return a < b ? a : b;
}

static int32_t max_i32(int32_t a, int32_t b) {
  return a > b ? a : b;
}

static int32_t initial_stack_capacity(int32_t pixel_count) {
  if (pixel_count <= 0) {
    return 1;
  }

  return pixel_count < 4096 ? pixel_count : 4096;
}

static uint32_t top_down_rgba_offset(int32_t x, int32_t y, int32_t width, int32_t height) {
  int32_t webgl_y = height - 1 - y;

  return (uint32_t)((webgl_y * width + x) * 4);
}

static int32_t pixel_matches(
  const uint8_t *pixels,
  uint32_t offset,
  int32_t red,
  int32_t green,
  int32_t blue,
  int32_t alpha,
  int32_t tolerance_sq
) {
  int32_t dr = (int32_t)pixels[offset] - red;
  int32_t dg = (int32_t)pixels[offset + 1u] - green;
  int32_t db = (int32_t)pixels[offset + 2u] - blue;
  int32_t da = (int32_t)pixels[offset + 3u] - alpha;

  return dr * dr + dg * dg + db * db + da * da <= tolerance_sq;
}

static int32_t floor_div_i32(int32_t value, int32_t divisor) {
  int32_t quotient = value / divisor;
  int32_t remainder = value % divisor;

  if (remainder != 0 && ((remainder < 0) != (divisor < 0))) {
    quotient -= 1;
  }

  return quotient;
}

__attribute__((export_name("flood_fill_dense_rgba")))
int32_t flood_fill_dense_rgba(
  uint32_t pixels_ptr,
  int32_t width,
  int32_t height,
  int32_t seed_x,
  int32_t seed_y,
  int32_t tolerance,
  uint32_t mask_ptr,
  uint32_t out_bounds_ptr
) {
  if (
    pixels_ptr == 0 ||
    mask_ptr == 0 ||
    out_bounds_ptr == 0 ||
    width <= 0 ||
    height <= 0 ||
    seed_x < 0 ||
    seed_y < 0 ||
    seed_x >= width ||
    seed_y >= height
  ) {
    return 0;
  }

  int32_t pixel_count = width * height;
  uint8_t *pixels = (uint8_t *)(uintptr_t)pixels_ptr;
  uint8_t *mask = (uint8_t *)(uintptr_t)mask_ptr;
  int32_t *out = (int32_t *)(uintptr_t)out_bounds_ptr;

  for (int32_t index = 0; index < pixel_count; index += 1) {
    mask[index] = 0;
  }

  if (!ensure_flood_stack_capacity(pixel_count)) {
    return 0;
  }

  int32_t *stack = (int32_t *)(uintptr_t)flood_stack_ptr;
  int32_t current_stack_capacity = initial_stack_capacity(pixel_count);
  int32_t max_stack_capacity = current_stack_capacity;
  int32_t stack_ptr = 0;
  int32_t seed_index = seed_y * width + seed_x;
  uint32_t seed_offset = top_down_rgba_offset(seed_x, seed_y, width, height);
  int32_t seed_r = pixels[seed_offset];
  int32_t seed_g = pixels[seed_offset + 1u];
  int32_t seed_b = pixels[seed_offset + 2u];
  int32_t seed_a = pixels[seed_offset + 3u];
  int32_t tolerance_sq = tolerance * tolerance;
  int32_t filled_count = 0;
  int32_t min_x = seed_x;
  int32_t max_x = seed_x;
  int32_t min_y = seed_y;
  int32_t max_y = seed_y;

#define PUSH_PIXEL(pixel_index_expr) \
  do { \
    int32_t push_index = (pixel_index_expr); \
    if (mask[push_index] == 0) { \
      if (stack_ptr >= current_stack_capacity) { \
        int32_t doubled = current_stack_capacity * 2; \
        int32_t requested = doubled > stack_ptr + 1 ? doubled : stack_ptr + 1; \
        current_stack_capacity = requested < pixel_count ? requested : pixel_count; \
        if (current_stack_capacity > max_stack_capacity) { \
          max_stack_capacity = current_stack_capacity; \
        } \
      } \
      mask[push_index] = 1; \
      stack[stack_ptr] = push_index; \
      stack_ptr += 1; \
    } \
  } while (0)

  PUSH_PIXEL(seed_index);

  while (stack_ptr > 0) {
    stack_ptr -= 1;

    int32_t index = stack[stack_ptr];
    int32_t y = index / width;
    int32_t x = index - y * width;
    uint32_t offset = top_down_rgba_offset(x, y, width, height);

    if (!pixel_matches(pixels, offset, seed_r, seed_g, seed_b, seed_a, tolerance_sq)) {
      continue;
    }

    mask[index] = 2;
    filled_count += 1;
    min_x = min_i32(min_x, x);
    max_x = max_i32(max_x, x);
    min_y = min_i32(min_y, y);
    max_y = max_i32(max_y, y);

    if (x + 1 < width && mask[index + 1] == 0) {
      PUSH_PIXEL(index + 1);
    }

    if (x > 0 && mask[index - 1] == 0) {
      PUSH_PIXEL(index - 1);
    }

    if (y + 1 < height && mask[index + width] == 0) {
      PUSH_PIXEL(index + width);
    }

    if (y > 0 && mask[index - width] == 0) {
      PUSH_PIXEL(index - width);
    }
  }

#undef PUSH_PIXEL

  if (filled_count <= 0) {
    return 0;
  }

  for (int32_t index = 0; index < pixel_count; index += 1) {
    mask[index] = mask[index] == 2 ? 1 : 0;
  }

  out[0] = min_x;
  out[1] = min_y;
  out[2] = max_x;
  out[3] = max_y;
  out[4] = filled_count;
  out[5] = max_stack_capacity * 4;

  return 1;
}

static int32_t sparse_tile_index(
  const int32_t *tile_lookup,
  int32_t lookup_width,
  int32_t lookup_height,
  int32_t lookup_origin_tx,
  int32_t lookup_origin_ty,
  int32_t tile_size,
  int32_t document_x,
  int32_t document_y
) {
  int32_t tx = floor_div_i32(document_x, tile_size);
  int32_t ty = floor_div_i32(document_y, tile_size);
  int32_t lookup_x = tx - lookup_origin_tx;
  int32_t lookup_y = ty - lookup_origin_ty;

  if (lookup_x < 0 || lookup_y < 0 || lookup_x >= lookup_width || lookup_y >= lookup_height) {
    return -1;
  }

  return tile_lookup[lookup_y * lookup_width + lookup_x];
}

static uint8_t sparse_channel(
  const uint8_t *tile_pixels,
  const int32_t *tile_meta,
  int32_t tile_count,
  const int32_t *tile_lookup,
  int32_t lookup_width,
  int32_t lookup_height,
  int32_t lookup_origin_tx,
  int32_t lookup_origin_ty,
  int32_t tile_size,
  int32_t document_x,
  int32_t document_y,
  int32_t channel
) {
  int32_t tile_index = sparse_tile_index(
    tile_lookup,
    lookup_width,
    lookup_height,
    lookup_origin_tx,
    lookup_origin_ty,
    tile_size,
    document_x,
    document_y
  );

  if (tile_index < 0 || tile_index >= tile_count) {
    return 0;
  }

  const int32_t *meta = tile_meta + tile_index * TILE_META_STRIDE;
  int32_t tile_x = meta[TILE_META_X];
  int32_t tile_y = meta[TILE_META_Y];
  int32_t tile_width = meta[TILE_META_WIDTH];
  int32_t tile_height = meta[TILE_META_HEIGHT];
  int32_t pixels_offset = meta[TILE_META_PIXELS_OFFSET];
  int32_t pixels_length = meta[TILE_META_PIXELS_LENGTH];
  int32_t local_x = document_x - tile_x;
  int32_t local_y = document_y - tile_y;

  if (local_x < 0 || local_y < 0 || local_x >= tile_width || local_y >= tile_height) {
    return 0;
  }

  uint32_t offset = top_down_rgba_offset(local_x, local_y, tile_width, tile_height);

  if ((int32_t)offset + channel < 0 || (int32_t)offset + channel >= pixels_length) {
    return 0;
  }

  return tile_pixels[pixels_offset + (int32_t)offset + channel];
}

static int32_t sparse_pixel_matches(
  const uint8_t *tile_pixels,
  const int32_t *tile_meta,
  int32_t tile_count,
  const int32_t *tile_lookup,
  int32_t lookup_width,
  int32_t lookup_height,
  int32_t lookup_origin_tx,
  int32_t lookup_origin_ty,
  int32_t tile_size,
  int32_t document_x,
  int32_t document_y,
  int32_t red,
  int32_t green,
  int32_t blue,
  int32_t alpha,
  int32_t tolerance_sq
) {
  int32_t dr = (int32_t)sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, document_x, document_y, 0) - red;
  int32_t dg = (int32_t)sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, document_x, document_y, 1) - green;
  int32_t db = (int32_t)sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, document_x, document_y, 2) - blue;
  int32_t da = (int32_t)sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, document_x, document_y, 3) - alpha;

  return dr * dr + dg * dg + db * db + da * da <= tolerance_sq;
}

__attribute__((export_name("flood_fill_sparse_rgba")))
int32_t flood_fill_sparse_rgba(
  uint32_t tile_pixels_ptr,
  uint32_t tile_meta_ptr,
  int32_t tile_count,
  uint32_t tile_lookup_ptr,
  int32_t lookup_width,
  int32_t lookup_height,
  int32_t lookup_origin_tx,
  int32_t lookup_origin_ty,
  int32_t tile_size,
  int32_t origin_x,
  int32_t origin_y,
  int32_t width,
  int32_t height,
  int32_t seed_x,
  int32_t seed_y,
  int32_t tolerance,
  uint32_t mask_ptr,
  uint32_t out_bounds_ptr
) {
  if (
    tile_pixels_ptr == 0 ||
    tile_meta_ptr == 0 ||
    tile_lookup_ptr == 0 ||
    mask_ptr == 0 ||
    out_bounds_ptr == 0 ||
    tile_count <= 0 ||
    lookup_width <= 0 ||
    lookup_height <= 0 ||
    tile_size <= 0 ||
    width <= 0 ||
    height <= 0 ||
    seed_x < 0 ||
    seed_y < 0 ||
    seed_x >= width ||
    seed_y >= height
  ) {
    return 0;
  }

  int32_t pixel_count = width * height;
  const uint8_t *tile_pixels = (uint8_t *)(uintptr_t)tile_pixels_ptr;
  const int32_t *tile_meta = (int32_t *)(uintptr_t)tile_meta_ptr;
  const int32_t *tile_lookup = (int32_t *)(uintptr_t)tile_lookup_ptr;
  uint8_t *mask = (uint8_t *)(uintptr_t)mask_ptr;
  int32_t *out = (int32_t *)(uintptr_t)out_bounds_ptr;

  for (int32_t index = 0; index < pixel_count; index += 1) {
    mask[index] = 0;
  }

  if (!ensure_flood_stack_capacity(pixel_count)) {
    return 0;
  }

  int32_t *stack = (int32_t *)(uintptr_t)flood_stack_ptr;
  int32_t current_stack_capacity = initial_stack_capacity(pixel_count);
  int32_t max_stack_capacity = current_stack_capacity;
  int32_t stack_ptr = 0;
  int32_t seed_index = seed_y * width + seed_x;
  int32_t seed_document_x = origin_x + seed_x;
  int32_t seed_document_y = origin_y + seed_y;
  int32_t seed_r = sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, seed_document_x, seed_document_y, 0);
  int32_t seed_g = sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, seed_document_x, seed_document_y, 1);
  int32_t seed_b = sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, seed_document_x, seed_document_y, 2);
  int32_t seed_a = sparse_channel(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, seed_document_x, seed_document_y, 3);
  int32_t tolerance_sq = tolerance * tolerance;
  int32_t filled_count = 0;
  int32_t min_x = seed_x;
  int32_t max_x = seed_x;
  int32_t min_y = seed_y;
  int32_t max_y = seed_y;

#define PUSH_PIXEL(pixel_index_expr) \
  do { \
    int32_t push_index = (pixel_index_expr); \
    if (mask[push_index] == 0) { \
      if (stack_ptr >= current_stack_capacity) { \
        int32_t doubled = current_stack_capacity * 2; \
        int32_t requested = doubled > stack_ptr + 1 ? doubled : stack_ptr + 1; \
        current_stack_capacity = requested < pixel_count ? requested : pixel_count; \
        if (current_stack_capacity > max_stack_capacity) { \
          max_stack_capacity = current_stack_capacity; \
        } \
      } \
      mask[push_index] = 1; \
      stack[stack_ptr] = push_index; \
      stack_ptr += 1; \
    } \
  } while (0)

  PUSH_PIXEL(seed_index);

  while (stack_ptr > 0) {
    stack_ptr -= 1;

    int32_t index = stack[stack_ptr];
    int32_t y = index / width;
    int32_t x = index - y * width;
    int32_t document_x = origin_x + x;
    int32_t document_y = origin_y + y;

    if (!sparse_pixel_matches(tile_pixels, tile_meta, tile_count, tile_lookup, lookup_width, lookup_height, lookup_origin_tx, lookup_origin_ty, tile_size, document_x, document_y, seed_r, seed_g, seed_b, seed_a, tolerance_sq)) {
      continue;
    }

    mask[index] = 2;
    filled_count += 1;
    min_x = min_i32(min_x, x);
    max_x = max_i32(max_x, x);
    min_y = min_i32(min_y, y);
    max_y = max_i32(max_y, y);

    if (x + 1 < width && mask[index + 1] == 0) {
      PUSH_PIXEL(index + 1);
    }

    if (x > 0 && mask[index - 1] == 0) {
      PUSH_PIXEL(index - 1);
    }

    if (y + 1 < height && mask[index + width] == 0) {
      PUSH_PIXEL(index + width);
    }

    if (y > 0 && mask[index - width] == 0) {
      PUSH_PIXEL(index - width);
    }
  }

#undef PUSH_PIXEL

  if (filled_count <= 0) {
    return 0;
  }

  for (int32_t index = 0; index < pixel_count; index += 1) {
    mask[index] = mask[index] == 2 ? 1 : 0;
  }

  out[0] = min_x;
  out[1] = min_y;
  out[2] = max_x;
  out[3] = max_y;
  out[4] = filled_count;
  out[5] = max_stack_capacity * 4;

  return 1;
}
