
import re
import os

def merge_html_files(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by DOCTYPE to identify separate documents
    # The first split might be empty if the file starts with split pattern
    docs = re.split(r'<!DOCTYPE html>', content, flags=re.IGNORECASE)
    
    # Filter out empty strings/whitespace
    docs = [d for d in docs if d.strip()]

    combined_body = ""
    collected_styles = ""
    collected_links = set()

    for i, doc in enumerate(docs):
        # basic extraction of head and body
        # Note: This is a simple regex parser, assuming standard structure
        
        # Extract styles
        styles = re.findall(r'<style>(.*?)</style>', doc, re.DOTALL | re.IGNORECASE)
        for style in styles:
            collected_styles += style + "\n"

        # Extract links (css)
        links = re.findall(r'<link[^>]+>', doc, re.IGNORECASE)
        for link in links:
            collected_links.add(link)

        # Extract body content
        body_match = re.search(r'<body[^>]*>(.*?)</body>', doc, re.DOTALL | re.IGNORECASE)
        if body_match:
            body_content = body_match.group(1).strip()
            # Wrap in a page-break div, except maybe the last one doesn't STRICTLY need it but good for uniformity
            # Using inline style for page-break-after
            combined_body += f'<div class="slide-page" style="page-break-after: always; position: relative; width: 1280px; height: 720px; overflow: hidden;">{body_content}</div>\n'
        else:
            # Fallback if no body tag found, though unlikely given the user input
            combined_body += f'<div class="slide-page" style="page-break-after: always;">{doc}</div>\n'

    # Create the final HTML
    final_html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Combined Slides</title>
    {''.join(collected_links)}
    <style>
        {collected_styles}
        body {{ 
            margin: 0; 
            padding: 0; 
            background-color: #f0f0f0; /* distinct from slide bg to see boundaries if needed */
        }}
        .slide-page {{
            /* Ensure the slide dimensions are respected during print/pdf gen */
            page-break-after: always;
            break-after: page;
        }}
        @media print {{
            @page {{
                size: 1280px 720px; 
                margin: 0;
            }}
            body {{
                margin: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}
        }}
    </style>
</head>
<body>
    {combined_body}
</body>
</html>
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_html)
    
    print(f"Successfully created {output_path} with {len(docs)} slides.")

if __name__ == "__main__":
    merge_html_files('/Users/shuta/jxc/interview-osaka/uploads/1.html', '/Users/shuta/jxc/interview-osaka/uploads/merged_slides.html')
