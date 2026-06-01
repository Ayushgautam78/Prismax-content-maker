const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 5000;

app.use(express.json());

// Enable CORS for all assets
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Configure static files with explicit CORS for the assets folder
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
    setHeaders: (res, path) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Assets dynamic scanning
app.get('/api/assets', (req, res) => {
    const assetsDir = path.join(__dirname, 'public', 'assets');
    const result = {};

    console.log(`[API] Checking directory: ${assetsDir}`);

    if (!fs.existsSync(assetsDir)) {
        console.error(`[API] Root assets directory NOT FOUND: ${assetsDir}`);
        return res.json({});
    }

    try {
        const categories = fs.readdirSync(assetsDir).filter(f => {
            return fs.statSync(path.join(assetsDir, f)).isDirectory();
        });

        console.log(`[API] Discovery - Found folders: ${categories.join(', ')}`);

        categories.forEach(cat => {
            const catDir = path.join(assetsDir, cat);
            const files = fs.readdirSync(catDir)
                .filter(file => /\.(png|jpg|jpeg|svg|webp)$/i.test(file));
            
            console.log(`[API] Processing category "${cat}": Found ${files.length} images`);
            
            result[cat.toLowerCase()] = files.map(file => ({
                id: file,
                name: file.split('.')[0],
                path: `/assets/${cat}/${file}`
            }));
        });
    } catch (err) {
        console.error(`[API] FATAL: Error during asset scanning:`, err);
    }

    res.json(result);
});

// Proxy route for AI infographic generation using secure, hardcoded Groq API
app.post('/api/ai/generate', async (req, res) => {
    const { prompt, styleTheme, layoutFlow, templateType } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        console.error("[API AI ERROR] GROQ_API_KEY environment variable is not configured!");
        return res.status(500).json({ error: 'AI Generator: GROQ_API_KEY is not configured in environment variables!' });
    }
    const MODEL = 'llama-3.3-70b-versatile';
    
    console.log(`[API AI] Generating design. Topic: "${prompt}", Style: ${styleTheme}, Layout: ${layoutFlow}, TemplateType: ${templateType}`);
    
    let templateInstructions = "";
    if (templateType === 'banner') {
        templateInstructions = `
- **Template Type: Marketing/Collab Banner (CRITICAL REQUIREMENT)**:
  - Focus on creating a stunning landscape/horizontal banner for marketing, releases, or announcements.
  - Set the canvas background to a rich, high-impact gradient matching the theme.
  - Include the brand logo "/assets/logos/logo-prismax-02.png" beautifully in the design (e.g. at x=150 or 540, y=100) with proper layout alignment.
  - Prioritize large, striking, elegant headings (fontSize: 55-75, y=200-300) and bold subheadings. Space elements vertically to keep a gorgeous layout.
  - DO NOT generate a flowchart! Do NOT generate connections/arrows or decision diamonds.
  - Strictly do NOT place any decorative stickers, stars, emojis, or background images on the canvas (except for the official brand logo).
  - Keep plenty of margins and empty space. Align everything professionally.
        `;
    } else if (templateType === 'poster') {
        templateInstructions = `
- **Template Type: Promo Poster/Social Post (CRITICAL REQUIREMENT)**:
  - Focus on creating a beautiful portrait/social media promotional flyer or poster.
  - Set the canvas background to a premium gradient.
  - Place the main heading in a highly stylized premium font (fontSize: 60-80, y=120) centered horizontally at x=540.
  - Create a central featured card or container (shape 'rounded_rect', width: 620, height: 420, x=540, y=460, fill="rgba(0,0,0,0.35)", stroke="#D4AF37", strokeWidth=2) to hold core description details.
  - Place detailed bullet texts, dates, or highlights inside that card using the text elements, aligned perfectly.
  - DO NOT generate a flowchart! Do NOT generate connections/arrows.
  - Place the brand logo "/assets/logos/logo-prismax-02.png" elegantly at the bottom center (x=540, y=880) as a clean branding footer.
        `;
    } else if (templateType === 'infographic') {
        templateInstructions = `
- **Template Type: Infographic Sheet (CRITICAL REQUIREMENT)**:
  - Focus on designing a rich, alternate left-right comparative column layout or structured grid infographic.
  - Set the canvas background to a clean, cohesive gradient.
  - Generate a series of structured content cards (shape 'rounded_rect', width: 280, height: 140) spaced beautifully across the canvas.
  - Draw thin elegant sketchy connecting lines or arrows with labels (annotations) between the cards to show progression.
  - Do NOT place any decorative stickers, badges, emojis, or background images on the canvas.
        `;
    } else { // flowchart
        templateInstructions = `
- **Template Type: Flowchart / Process Map (CRITICAL REQUIREMENT)**:
  - Focus on designing a beautiful, highly professional Excalidraw-like process flowchart.
  - **Hierarchical Tree-Style Structure (CRITICAL REQUIREMENT)**: 
    - The flowchart layout MUST be structured as a perfect top-down hierarchical tree (or left-to-right branch tree).
    - Top Level (Root Node): A single high-level initiator or controller card at the top (e.g., x=540, y=120).
    - Middle Level (Branches): Split the flow into 2 or 3 parallel child branch cards positioned side-by-side horizontally underneath the root node (e.g. Left Child at x=280, y=360; Middle Child at x=540, y=360; Right Child at x=800, y=360).
    - Bottom Level (Sub-Branches or Leaves): Show further branching or convergence onto final outcome nodes at the bottom (e.g., x=540, y=600 or y=800).
    - Grid Coordinates: Spatially distribute the tree nodes with generous, precise coordinates (spacing of **at least 240px to 300px** horizontally and vertically) so that connection curves never overlap with other blocks or texts.
  - **No Stickers (CRITICAL)**: Strictly do NOT place any generic stickers, icons, stars, or decorative images on the canvas. Keep it strictly focused on professional blocks, texts, and curved connection lines!
  - **Connections**: Draw thin, curved smart-arrows representing this perfect hierarchical tree structure. Do NOT generate any "label" text or annotations on connection lines/arrows.
  - **NO TEXTS OUTSIDE FLOWCHART BLOCKS (CRITICAL)**: Do NOT generate any separate "text" elements for the flowchart title, subtitles, or page headers. The flowchart must consist ONLY of wobbly shape nodes with a single title placed inside the shapes, and thin connecting arrows. Do NOT generate a description property or tiny subtitle text inside the shapes! Do NOT place any connection labels or separate texts anywhere outside the shape blocks!
        `;
    }

    const systemPrompt = `You are a professional graphic designer specializing in gorgeous information architecture, flowcharts, marketing banners, and collaborative social posts.

${templateInstructions}

JSON Structure:
{
  "canvas": {
    "background": "#color" OR {"type": "gradient", "start": "#color1", "end": "#color2", "direction": "vertical"|"horizontal"|"diagonal"}
  },
  "elements": [
    {
      "id": "el_1",
      "type": "text",
      "text": "Heading Text",
      "x": 540,
      "y": 300,
      "fontSize": 48,
      "fontFamily": "Orbitron" | "Audiowide" | "Montserrat" | "Bebas Neue" | "Satisfy" | "Caveat" | "Playfair Display" | "Cinzel",
      "textColor": "#ffffff",
      "fontWeight": "bold" | "normal",
      "width": 600
    },
    {
      "id": "el_2",
      "type": "shape",
      "shapeType": "rect" | "rounded_rect" | "circle" | "diamond",
      "x": 540,
      "y": 500,
      "width": 240,
      "height": 100,
      "fill": "rgba(0,255,255,0.08)",
      "stroke": "#00FFFF",
      "strokeWidth": 2.5,
      "textColor": "#ffffff",
      "title": "Text Label inside shape (use this to write text inside card/node!)",
      "description": "Optional secondary text description inside shape"
    },
    {
      "id": "el_3",
      "type": "image",
      "src": "asset_file_path",
      "x": 540,
      "y": 700,
      "width": 200,
      "height": 100
    }
  ],
  "connections": [
    {
      "from": "el_2",
      "to": "el_4",
      "label": "collaboration"
    }
  ]
}

Asset Library (ONLY use these exact file paths when placing images):
- Logos:
  - "/assets/logos/logo-prismax-02.png" (Premium gold logo for dark themes - highly recommended!)
  - "/assets/logos/logo-prismax-01.png" (Premium dark gold logo for light themes)
  - "/assets/logos/lockup.png" (Text brand lockup logo)
- Stickers & Accents:
  - (The AI Assistant does NOT have permission to access, generate, or use design stickers, decorative accents, emojis, stars, or brush splashes. Strictly do NOT place any sticker paths on the canvas!)

Design & Layout instructions:
- The canvas coordinate space is exactly 1080x1080. All x/y coordinates MUST be between 80 and 950 so they remain fully visible within the margins, with plenty of breathing room at the top, bottom, left, and right.
- **Color Theme Priority**:
  - ALWAYS prioritize any specific colors, brand hex codes, or color schemes requested by the user directly in their prompt (e.g. "made a post with red background" -> background must be red, "blue theme" -> deep blue background and white/cyan shapes, "Nvidia colors" -> green and black gradient, "purple neon" -> deep purple with pink neon accents).
  - If no specific colors or themes are requested in the prompt, fall back to the selected Style Theme.
- **Excalidraw & Modern Sketch Aesthetic (CRITICAL REQUIREMENT)**:
  - We do NOT want raw, rigid, beginner-friendly block flowcharts. The output must look like a gorgeous, custom vector sketch made in advanced tools like **Excalidraw** or **Figma**!
  - **Sketch Typography**: You MUST use handwritten, organic sketch fonts like "Caveat", "Kalam", or "Architects Daughter" for all titles, descriptions, and connection labels! This is what gives it that ultra-stylish, hand-drawn Excalidraw feel.
  - **Text Inside shapes (CRITICAL)**: For all flowchart process steps, cards, and nodes, you MUST place a single label directly inside the shape element using the "title" and "textColor" properties! Do NOT generate a "description" property or any secondary subtitle/tiny texts for shape elements—only a single, clear, bold title should be inside each node. Do NOT create separate "text" elements for these labels.
  - **NO Separate Annotation Texts (CRITICAL)**: NEVER generate separate "text" elements for flowchart labels, connection annotations, or block captions! All annotations/labels for arrows MUST go directly into the "label" property of the "connections" array. The ONLY time you may create a separate "text" element is for the main page header/title at the very top of the canvas (e.g. y = 60).
  - **Vibrant Colorful Shapes**: Make the flowchart nodes highly colorful and beautiful! Use a different vibrant, modern accent color for each separate block (e.g. Node 1 has cyan fill/stroke, Node 2 has magenta fill/stroke, Node 3 has gold fill/stroke, Node 4 has emerald fill/stroke). This gives a premium, playful, pleasing aesthetic.
  - **High-Contrast White Text**: Set the "textColor" property inside the shape elements to "#ffffff" (or bright white) so that the labels are perfectly readable, clean, and pop beautifully on the colorful fills!
  - **Perfect Layout Centering & Spacing (CRITICAL)**:
    - Flowchart nodes MUST be spaced vertically or horizontally by **at least 200px to 220px** to ensure connecting arrows are long enough and connection labels render cleanly without overlapping shapes!
    - If Layout Flow is "vertical", you MUST center all nodes horizontally exactly at x=540, and space them vertically with generous margins (e.g. y=120, 320, 520, 720, 920).
    - If Layout Flow is "horizontal", you MUST center all nodes vertically exactly at y=540, and space them horizontally with generous margins (e.g. x=120, 320, 520, 720, 920).
    - This centering at 540 ensures the entire flowchart maps perfectly to the visual center of any screen or canvas ratio (including landscape 16:9 and portrait 9:16) with gorgeous, professional margins!
  - **Optimal Node Widths**: Flowchart cards (rect, rounded_rect) must have a width of **at least 240px to 280px** (e.g. width=260, height=100) to ensure the text fits beautifully inside without wrapping too aggressively. Diamond shapes should have a width of at least 150px to 170px to fit query texts nicely!
  - **Premium 3D Offset Cards**: To make a process block look highly stylized:
    - Draw a backdrop block (e.g., shape 'rounded_rect' with 'fill' a solid base color or matching transparent color, 'stroke' is transparent).
    - Draw an outline front card *slightly offset* by 5px (e.g., shape 'rounded_rect' at 'x = backdrop_x - 5', 'y = backdrop_y - 5', 'fill="transparent"', 'stroke' is the primary accent color, 'strokeWidth=2').
    - Put the "title" and "textColor" properties ONLY on the front card (the outline shape), and leave them blank on the backdrop card! This creates a gorgeous, hand-sketched overlapping card drop effect with perfectly centered text!
  - **STRICT NO-STICKER BAN (CRITICAL)**: The AI Assistant does NOT have permission to use or generate design stickers, decorative accents, emojis, stars, or brush splashes. Strictly do NOT place any '/assets/stickers/...' paths on the canvas. Any decorative sticker elements generated in your JSON will fail rendering constraints!
- If the user asks for a flowchart, process, or diagram:
  - Create shape elements (nodes) containing centered text.
  - Draw lines connecting them using the "connections" array.
- If the user asks for a poster, collab banner, announcement, or marketing post:
  - Focus on beautiful typography (larger titles e.g. fontSize 56-72, subheadings 36-44, bodies 24-28).
  - Place a logo dynamically! E.g. Add "/assets/logos/logo-prismax-02.png" beautifully at the top center or bottom.
  - Choose a matching background gradient.
  - **LOGO ONLY IMAGE PERMISSION (CRITICAL)**: The only image assets allowed to be placed on the canvas are the official brand logos (e.g. '/assets/logos/logo-prismax-02.png' for dark themes and '/assets/logos/logo-prismax-01.png' for light themes). Keep all designs completely clean, highly professional, and free of any emoji or cartoon sticker clutter.
  - Space elements cleanly so nothing overlaps. Align everything professionally!
  - DO NOT generate connections/arrows if a clean slide or banner is requested.

`;

    const userPrompt = `
Topic: "${prompt}"
Style Theme: "${styleTheme || 'dark_gold'}"
Layout Orientation: "${layoutFlow || 'vertical'}"

CRITICAL SYSTEM OVERRIDE (NEVER BYPASS):
- You MUST NEVER place, reference, or use any stickers, stars, cartoon mascots, accent icons, or decorative badges (such as excited, happy, s12, s15, etc.) in your generated elements.
- This sticker ban is ABSOLUTE. Even if the topic or user prompt explicitly asks for "stickers", "mascots", "decorations", or "cats", you must IGNORE that request and use ONLY clean typography, background gradients, and official brand logos.
- The ONLY images allowed on the canvas are the official brand logos: "/assets/logos/logo-prismax-02.png" (Premium gold for dark themes) and "/assets/logos/logo-prismax-01.png" (for light themes). Any other image paths will fail validation!
`;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.3,
                response_format: { type: "json_object" }
            })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            console.error(`[API AI] Groq API Error response:`, errText);
            return res.status(response.status).json({ error: `Groq API Error: ${errText}` });
        }
        
        const data = await response.json();
        
        // Server-Side Strict Content Filter: physically strip stickers or any non-logo image paths
        try {
            if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                const contentStr = data.choices[0].message.content;
                const jsonContent = JSON.parse(contentStr);
                
                if (jsonContent.elements && Array.isArray(jsonContent.elements)) {
                    const originalLength = jsonContent.elements.length;
                    jsonContent.elements = jsonContent.elements.filter(el => {
                        const src = el.src || '';
                        if (el.type === 'image' || src) {
                            // Check if the image source points to an official brand logo
                            const isLogo = src.startsWith('/assets/logos/') || src.startsWith('assets/logos/');
                            if (!isLogo) {
                                console.warn(`[STICKER BAN] Filtered out unauthorized AI asset: "${src}"`);
                                return false;
                            }
                        }
                        return true;
                    });
                    
                    if (jsonContent.elements.length !== originalLength) {
                        console.log(`[STICKER BAN] Stripped ${originalLength - jsonContent.elements.length} unauthorized assets from AI payload.`);
                    }
                }
                
                // Re-serialize filtered content
                data.choices[0].message.content = JSON.stringify(jsonContent);
            }
        } catch (parseErr) {
            console.error("[API AI] Error parsing or filtering AI JSON payload:", parseErr);
        }
        
        return res.json(data);
    } catch (err) {
        console.error("[API AI ERROR]", err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
});

// Catch-all route to serve index.html - MOVED TO END
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Prisma X Content Maker by Ayush running on port ${PORT}`);
    });
}

module.exports = app;
