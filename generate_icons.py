import struct

def create_bmp(width, height, pixels):
    # BMP Header
    file_size = 54 + len(pixels)
    header = struct.pack('<2sIHHI', b'BM', file_size, 0, 0, 54)
    
    # DIB Header
    dib_header = struct.pack('<IiiHHIIIIII', 40, width, height, 1, 24, 0, len(pixels), 0, 0, 0, 0)
    
    return header + dib_header + pixels

def generate_claw_icon(size):
    width, height = size, size
    # Background: White (255, 255, 255)
    # Claw: Orange (0, 165, 255) in BGR -> (0, 165, 255)
    
    row_padding = (4 - (width * 3) % 4) % 4
    pixel_data = bytearray()
    
    for y in range(height):
        row = bytearray()
        for x in range(width):
            # Simple "Claw" shape logic
            # Three vertical stripes
            is_claw = False
            if height * 0.2 < y < height * 0.8:
                if (width * 0.2 < x < width * 0.3) or \
                   (width * 0.45 < x < width * 0.55) or \
                   (width * 0.7 < x < width * 0.8):
                    is_claw = True
            
            # Base of the claw
            if height * 0.1 < y < height * 0.25 and width * 0.2 < x < width * 0.8:
                is_claw = True

            if is_claw:
                row.extend([0, 165, 255]) # Orange BGR
            else:
                row.extend([255, 255, 255]) # White
        
        row.extend([0] * row_padding)
        pixel_data.extend(row)
        
    return create_bmp(width, height, pixel_data)

sizes = [16, 32, 48, 128]
for size in sizes:
    bmp_data = generate_claw_icon(size)
    filename = f"icons/icon{size}.bmp"
    with open(filename, "wb") as f:
        f.write(bmp_data)
    print(f"Generated {filename}")
