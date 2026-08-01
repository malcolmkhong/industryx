import svgtrace
import sys

input_path = r'C:\Users\malco\Downloads\ChatGPT Image Jun 19, 2026, 06_08_47 AM.png'
output_path = r'a:\industryx\industryx\public\logo.svg'

try:
    result = svgtrace.trace(input_path, blackAndWhite=True)
    print(f'Trace successful, length: {len(result)}')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(result)
    print(f'Saved to: {output_path}')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
