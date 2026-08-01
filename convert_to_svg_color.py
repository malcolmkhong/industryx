import svgtrace
import re
import xml.etree.ElementTree as ET

input_path = r'C:\Users\malco\Downloads\ChatGPT Image Jun 19, 2026, 06_08_47 AM.png'
output_path = r'a:\industryx\industryx\public\logo.svg'

# Trace with colors (default mode)
result = svgtrace.trace(input_path)
print(f'Trace successful, original length: {len(result)}')

# Parse SVG
root = ET.fromstring(result)
ns = 'http://www.w3.org/2000/svg'

def parse_rgb(rgb_str):
    """Parse 'rgb(R,G,B)' to (R,G,B) tuple"""
    m = re.match(r'rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', rgb_str)
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None

def is_dark_fill(fill_str, threshold=30):
    """Check if a fill color is dark (likely background)"""
    if not fill_str:
        return False
    rgb = parse_rgb(fill_str)
    if rgb:
        # Dark if all channels are below threshold
        return all(v < threshold for v in rgb)
    return False

# Remove paths with dark fills (the background)
removed_count = 0
kept_count = 0

for path in list(root.iter(f'{{{ns}}}path')):
    fill = path.get('fill', '')
    if is_dark_fill(fill):
        root.remove(path)
        removed_count += 1
    else:
        kept_count += 1

print(f'Removed {removed_count} dark-fill paths, kept {kept_count} paths')

# Add white background rect
bg_rect = ET.SubElement(root, f'{{{ns}}}rect')
bg_rect.set('x', '0')
bg_rect.set('y', '0')
bg_rect.set('width', '1254')
bg_rect.set('height', '1254')
bg_rect.set('fill', 'white')
root.insert(0, bg_rect)

# Serialize
svg_content = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='unicode')

print(f'Final length: {len(svg_content)}')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(svg_content)
print(f'Saved to: {output_path}')
