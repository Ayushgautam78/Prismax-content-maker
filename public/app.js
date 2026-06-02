const CANVAS_RATIOS = {
    square: { w: 1080, h: 1080 },
    landscape: { w: 1920, h: 1080 },
    portrait: { w: 1080, h: 1920 },
    banner: { w: 1200, h: 630 }
};

let canvas;
let virtualFormat = { w: 1080, h: 1080 }; // Default
let isMobile = window.innerWidth < 768;
window.isMobile = isMobile;
let lastWidth = window.innerWidth;
let lastHeight = window.innerHeight;

// History State Management
const MAX_HISTORY = 50;
let historyStack = [];
let redoStack = [];
let isHistoryAction = false;

// Arrow Connection State
let isArrowMode = false;
let firstArrowTarget = null;
let connections = []; // Array of objects { from: objId, to: objId, line: fabObj }

// Font List configuration
const fontsList = [
    "Caveat", "Caveat Brush", "Kalam", "Patrick Hand", "Permanent Marker", "Indie Flower",
    "Shadows Into Light", "Dancing Script", "Pacifico", "Satisfy", "Amatic SC", "Gloria Hallelujah",
    "Rock Salt", "Architects Daughter", "Coming Soon", "Handlee", "Gochi Hand", "Reenie Beanie",
    "Just Another Hand", "Covered By Your Grace", "Bebas Neue", "Anton", "Oswald", "Righteous",
    "Audiowide", "Orbitron", "Fredoka", "Lilita One", "Cinzel", "Cinzel Decorative",
    "Cormorant Garamond", "Playfair Display", "IM Fell English", "Libre Baskerville",
    "Montserrat", "Raleway", "Nunito", "Quicksand", "Poppins"
];

const PRESET_SOLID_BGS = ['#000000', '#3e2723', '#ffffff', '#fdfbf7', '#001f3f', '#013220'];
const PRESET_GRAD_BGS = [
    { name: 'Dark Gold', css: 'linear-gradient(45deg, #221a00, #D4AF37)', type: 'linear', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: '#221a00' }, { offset: 1, color: '#D4AF37' }] },
    { name: 'Brown Gold', css: 'linear-gradient(45deg, #3e2723, #D4AF37)', type: 'linear', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: '#3e2723' }, { offset: 1, color: '#D4AF37' }] },
    { name: 'Brown Yellow', css: 'linear-gradient(45deg, #5d4037, #fbc02d)', type: 'linear', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: '#5d4037' }, { offset: 1, color: '#fbc02d' }] },
    { name: 'Silver Sky', css: 'linear-gradient(45deg, #757575, #e0e0e0)', type: 'linear', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: '#757575' }, { offset: 1, color: '#e0e0e0' }] },
    { name: 'Cosmic', css: 'linear-gradient(45deg, #0f0c29, #302b63, #24243e)', type: 'linear', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: '#0f0c29' }, { offset: 0.5, color: '#302b63' }, { offset: 1, color: '#24243e' }] },
    { name: 'Electric', css: 'linear-gradient(45deg, #1CB5E0, #000046)', type: 'linear', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: '#1CB5E0' }, { offset: 1, color: '#000046' }] }
];

document.addEventListener("DOMContentLoaded", () => {
    // 1. Critical Startup Modal Listeners (Must be first!)
    let _ratioFiring = false; // debounce guard for touch+click double-fire
    const ratioHandler = (btn) => {
        if (_ratioFiring) return;
        _ratioFiring = true;
        setTimeout(() => { _ratioFiring = false; }, 400);

        if (typeof canvas !== 'undefined' && canvas && canvas.getObjects().length > 0) {
            if (!confirm("Changing the canvas ratio will resize your workspace and may affect your layout. Proceed?")) return;
        }
        const w = parseInt(btn.dataset.width);
        const h = parseInt(btn.dataset.height);
        console.log('[Startup] Ratio selected:', w, 'x', h);
        try {
            startStudio(w, h);
        } catch (err) {
            console.error('[Startup] startStudio crashed:', err);
            // Emergency fallback: unhide app anyway
            document.getElementById('startup_modal')?.classList.add('hidden');
            document.getElementById('app')?.classList.remove('hidden');
        }
    };

    document.querySelectorAll('.ratio-btn').forEach(btn => {
        const h = (e) => {
            e.preventDefault(); e.stopPropagation();
            ratioHandler(btn);
        };
        btn.addEventListener('click', h);
        btn.addEventListener('touchstart', h, { passive: false });
    });

    document.getElementById('btn_custom_ratio')?.addEventListener('click', () => {
        if (typeof canvas !== 'undefined' && canvas && canvas.getObjects().length > 0) {
            if (!confirm("Changing the canvas ratio will resize your workspace and may affect your layout. Proceed?")) return;
        }
        const w = parseInt(document.getElementById('custom_w').value) || 800;
        const h = parseInt(document.getElementById('custom_h').value) || 600;
        startStudio(w, h);
    });

    // 2. Secondary UI Initialization — each wrapped so one failure doesn't block others
    const _safeInit = (name, fn) => { try { fn(); } catch(e) { console.error(`[Init] ${name} failed:`, e); } };
    _safeInit('initPickers', initPickers);
    _safeInit('initUI', initUI);
    _safeInit('initFonts', initFonts);
    _safeInit('initBgPalettes', initBgPalettes);
    _safeInit('loadAssets', loadAssets);
    _safeInit('initUploadedAssets', initUploadedAssets);
    _safeInit('initAIControls', initAIControls);
    _safeInit('initMobileBottomNav', initMobileBottomNav);

    // Initialize base history state on mobile startup for back button interception
    if (isMobile) {
        history.replaceState({ type: 'base' }, '');
    }

    window.addEventListener('popstate', (event) => {
        if (!isMobile) return;
        
        const templatesModal = document.getElementById('templates_modal');
        const aiModal = document.getElementById('ai_modal');
        const exportModal = document.getElementById('export_modal');
        const leftSidebar = document.getElementById('left_sidebar');
        const rightSidebar = document.getElementById('right_sidebar');
        
        // 1. Close active full-screen modals first
        if (templatesModal && !templatesModal.classList.contains('hidden')) {
            if (typeof closeTemplatesModal === 'function') {
                closeTemplatesModal(true);
            } else {
                templatesModal.classList.add('hidden');
            }
        }
        if (aiModal && !aiModal.classList.contains('hidden')) {
            if (typeof closeAIModal === 'function') {
                closeAIModal(true);
            } else {
                aiModal.classList.add('hidden');
            }
        }
        if (exportModal && !exportModal.classList.contains('hidden')) {
            if (typeof window.closeExportModal === 'function') {
                window.closeExportModal(true);
            } else {
                exportModal.classList.add('hidden');
            }
        }
        
        // 2. Close active slide-out sheets
        if ((leftSidebar && leftSidebar.classList.contains('sheet-open')) || 
            (rightSidebar && rightSidebar.classList.contains('sheet-open'))) {
            if (typeof closeMobileSheets === 'function') {
                closeMobileSheets(true);
            } else {
                leftSidebar?.classList.remove('sheet-open');
                rightSidebar?.classList.remove('sheet-open');
                const backdrop = document.getElementById('mob_sheet_backdrop');
                if (backdrop) backdrop.classList.remove('visible');
            }
        }
    });

    window.addEventListener('resize', handleResize);
    window.addEventListener('focus', handleResize);

    // ========== RESIZEOBSERVER FOR WORKSPACE INNER CONTAINER ==========
    const workspace = document.getElementById('workspace_inner');
    if (workspace) {
        const resizeObserver = new ResizeObserver(() => {
            if (canvas) {
                resizeCanvas(false);
                canvas.calcOffset();
            }
        });
        resizeObserver.observe(workspace);
    }

    // ========== DESKTOP DRAG-AND-DROP FILE DROP HANDLER ==========
    const canvasContainer = document.getElementById('canvas_container');
    if (canvasContainer) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            canvasContainer.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        canvasContainer.addEventListener('dragover', () => {
            canvasContainer.classList.add('drag-active');
        });

        canvasContainer.addEventListener('dragleave', () => {
            canvasContainer.classList.remove('drag-active');
        });

        canvasContainer.addEventListener('drop', (e) => {
            canvasContainer.classList.remove('drag-active');
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const pointer = canvas.getPointer(e);
                        const targetFrame = findFrameAtPointer(pointer);
                        
                        // Compress and cache dropped image
                        const imgObj = new Image();
                        imgObj.onload = function () {
                            const tempCanvas = document.createElement('canvas');
                            const ctx = tempCanvas.getContext('2d');
                            const maxDimension = 650;
                            let width = imgObj.width;
                            let height = imgObj.height;
                            if (width > maxDimension || height > maxDimension) {
                                if (width > height) {
                                    height = Math.round((height * maxDimension) / width);
                                    width = maxDimension;
                                } else {
                                    width = Math.round((width * maxDimension) / height);
                                    height = maxDimension;
                                }
                            }
                            tempCanvas.width = width;
                            tempCanvas.height = height;
                            ctx.drawImage(imgObj, 0, 0, width, height);

                            let compressedDataUrl;
                            if (file.type === 'image/png' || file.type === 'image/svg+xml') {
                                compressedDataUrl = tempCanvas.toDataURL('image/png');
                            } else {
                                compressedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
                            }

                            const assetId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                            const assetName = file.name.split('.')[0];
                            
                            uploadedAssets.push({ id: assetId, name: assetName, src: compressedDataUrl });
                            try {
                                localStorage.setItem('prismax_uploaded_assets', JSON.stringify(uploadedAssets));
                                renderUploadedAssetsGrid();
                            } catch (cacheErr) {
                                console.warn("Cache quota full during drop upload:", cacheErr);
                            }

                            fabric.Image.fromURL(compressedDataUrl, (img) => {
                                if (targetFrame) {
                                    insertImageIntoFrame(targetFrame, img, compressedDataUrl);
                                    showToast("📷 Image dropped directly into the sketchy frame!");
                                } else {
                                    img.set({
                                        left: pointer.x,
                                        top: pointer.y,
                                        originX: 'center',
                                        originY: 'center',
                                        uploadedAssetId: assetId // Set cache link!
                                    });
                                    if (img.width > 400) img.scaleToWidth(400);
                                    canvas.add(img);
                                    canvas.setActiveObject(img);
                                    saveHistory();
                                    canvas.requestRenderAll();
                                    showToast("📷 Image added and cached!");
                                }
                            });
                        };
                        imgObj.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            }
        }, false);
    }

    // 3. Persistent Memory Recovery
    setTimeout(checkSavedDesign, 100);
});

function checkSavedDesign() {
    try {
        const saved = localStorage.getItem('prismax_design_v2') || localStorage.getItem('prismax_design');
        const ratio = localStorage.getItem('prismax_ratio');
        if (saved && ratio) {
            console.log("[Studio] Recovering saved project from memory...");
            const r = JSON.parse(ratio);
            startStudio(r.w, r.h, saved);
        }
    } catch (err) {
        console.error('[checkSavedDesign] Recovery failed:', err);
        // Clear corrupted state so user isn't stuck forever
        localStorage.removeItem('prismax_design_v2');
        localStorage.removeItem('prismax_design');
        localStorage.removeItem('prismax_ratio');
    }
}

const switchTab = (targetId, tabName) => {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    const panel = document.getElementById(targetId);
    if (panel) panel.classList.add('active');

    if (isMobile) {
        // Track if any sheet was already open to avoid redundant pushStates
        const alreadyOpen = document.getElementById('left_sidebar').classList.contains('sheet-open') || 
                            document.getElementById('right_sidebar').classList.contains('sheet-open');

        // Update bottom nav active state
        document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
        const matchingBtn = document.querySelector(`.mob-nav-btn[data-mob-target="${targetId}"]`);
        if (matchingBtn) matchingBtn.classList.add('active');

        if (targetId === 'panel_props') {
            // Properties sheet
            document.getElementById('right_sidebar').classList.add('sheet-open');
            document.getElementById('left_sidebar').classList.remove('sheet-open');
        } else {
            document.getElementById('right_sidebar').classList.remove('sheet-open');
            document.getElementById('left_sidebar').classList.add('sheet-open');
        }

        // Push history state if opening a sheet for the first time
        if (!alreadyOpen) {
            history.pushState({ sheet: 'open' }, '');
        }

        // Show backdrop when any sheet opens
        const backdrop = document.getElementById('mob_sheet_backdrop');
        if (backdrop) backdrop.classList.add('visible');

        // Hide floating action bar when sheet opens
        updateMobileObjectBar();
    }
};

function closeMobileSheets(viaPopstate = false) {
    if (!isMobile) return;
    
    const leftOpen = document.getElementById('left_sidebar')?.classList.contains('sheet-open');
    const rightOpen = document.getElementById('right_sidebar')?.classList.contains('sheet-open');
    
    document.getElementById('left_sidebar')?.classList.remove('sheet-open');
    document.getElementById('right_sidebar')?.classList.remove('sheet-open');
    document.getElementById('mob_sheet_backdrop')?.classList.remove('visible');
    document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
    
    // Show floating action bar again when sheet closes (if object selected)
    updateMobileObjectBar();

    // Clean up history entry if closed manually via backdrop click or X button
    if (!viaPopstate && (leftOpen || rightOpen)) {
        history.back();
    }
}

function initMobileBottomNav() {
    // Prevent deselecting canvas objects when tapping on the bottom navigation or the floating object bar
    const mobBar = document.getElementById('mob_object_bar');
    if (mobBar) {
        ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(evtType => {
            mobBar.addEventListener(evtType, (e) => {
                e.stopPropagation();
            });
        });
    }

    const mobNav = document.getElementById('mobile_bottom_nav');
    if (mobNav) {
        ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(evtType => {
            mobNav.addEventListener(evtType, (e) => {
                e.stopPropagation();
            });
        });
    }

    // Wire up each bottom nav button
    document.querySelectorAll('.mob-nav-btn[data-mob-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.mobTarget;
            
            // Intercept Templates to open the premium Templates Modal directly!
            if (target === 'panel_templates') {
                openTemplatesModal();
                return;
            }
            
            // Intercept AI to open the AI modal directly!
            if (target === 'panel_ai') {
                openAIModal();
                return;
            }

            const tabNames = {
                panel_templates: 'Templates',
                panel_assets: 'Assets',
                panel_text: 'Text',
                panel_shapes: 'Shapes',
                panel_frames: 'Frames',
                panel_arrows: 'Arrow',
                panel_bg: 'Background',
                panel_layers: 'Layers',
                panel_ai: 'AI',
                panel_props: 'Edit'
            };

            // Toggle: if this sheet is already open, close it
            const leftOpen = document.getElementById('left_sidebar').classList.contains('sheet-open');
            const rightOpen = document.getElementById('right_sidebar').classList.contains('sheet-open');
            const activeMobBtn = document.querySelector('.mob-nav-btn.active');
            if ((leftOpen || rightOpen) && activeMobBtn === btn) {
                closeMobileSheets();
                return;
            }

            switchTab(target, tabNames[target] || '');
        });
    });

    // Theme toggle button
    const themeBtn = document.getElementById('mob_btn_theme');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.getElementById('btn_theme_toggle_desk')?.click();
            showToast("🎨 Theme toggled!");
        });
    }

    // Download button
    const dlBtn = document.getElementById('mob_btn_download');
    if (dlBtn) {
        dlBtn.addEventListener('click', () => {
            document.getElementById('btn_top_download')?.click();
        });
    }

    // Backdrop tap → close sheets
    const backdrop = document.getElementById('mob_sheet_backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeMobileSheets);
    }
}

// Show/hide the floating object action bar on mobile
function updateMobileObjectBar() {
    if (!isMobile) return;
    const bar = document.getElementById('mob_object_bar');
    if (!bar) return;

    // Don't show floating bar if any bottom sheet is open
    const leftOpen = document.getElementById('left_sidebar')?.classList.contains('sheet-open');
    const rightOpen = document.getElementById('right_sidebar')?.classList.contains('sheet-open');
    if (leftOpen || rightOpen) {
        bar.classList.remove('visible');
        return;
    }

    const active = canvas && canvas.getActiveObject();
    // Don't show bar when crop mode is active
    if (activeCropBox) {
        bar.classList.remove('visible');
        return;
    }
    if (active) {
        bar.classList.add('visible');
    } else {
        bar.classList.remove('visible');
    }
}

function initQuickToolbar() {
    const subNav = document.getElementById('quick_access_toolbar');
    if (!subNav) return;
    const container = subNav.querySelector('.sub-tabs-inner');
    container.innerHTML = '';
    subNav.classList.remove('hidden');

    const subOptions = [
        { name: 'Backgrounds', target: 'panel_bg' },
        { name: 'Logo', target: 'grid_logos' },
        { name: 'Stickers', target: 'grid_stickers' },
        { name: 'Elements', target: 'grid_elements' },
        { name: 'Uploads', target: 'assets_my' }
    ];

    subOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'sub-pill';
        btn.innerText = opt.name;
        btn.onclick = () => {
            if (opt.target === 'panel_bg') {
                switchTab('panel_bg', 'Background');
            } else if (opt.target === 'assets_my') {
                switchTab('panel_assets', 'Assets');
                // Switch to Uploads sub-tab in panel
                const uploadsTabBtn = document.querySelector('.sub-tab[data-sub="assets_my"]');
                if (uploadsTabBtn) uploadsTabBtn.click();
            } else {
                switchTab('panel_assets', 'Assets');
                // Switch to Official sub-tab in panel
                const officialTabBtn = document.querySelector('.sub-tab[data-sub="assets_off"]');
                if (officialTabBtn) officialTabBtn.click();
                
                const el = document.getElementById(opt.target);
                // Small delay to allow sheet to animate/render
                if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
            }
            const inner = subNav.querySelector('.sub-tabs-inner');
            inner.querySelectorAll('.sub-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
        };
        container.appendChild(btn);
    });

    // Add a dedicated glowing direct "Upload Asset" cloud button at the end of the quick nav
    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'sub-pill';
    uploadLabel.style.cursor = 'pointer';
    uploadLabel.style.background = 'rgba(212, 175, 55, 0.16)';
    uploadLabel.style.borderColor = 'var(--primary-gold)';
    uploadLabel.style.color = 'var(--primary-gold)';
    uploadLabel.style.display = 'inline-flex';
    uploadLabel.style.alignItems = 'center';
    uploadLabel.style.gap = '5px';
    uploadLabel.style.fontWeight = '700';
    uploadLabel.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Asset';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png, image/jpeg, image/svg+xml';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function (e) {
        handleFileUpload(e.target.files[0]);
        e.target.value = ''; // reset file input
    });

    uploadLabel.appendChild(fileInput);
    container.appendChild(uploadLabel);
}

let GLOBAL_SWATCHES = ['#D4AF37', '#000000', '#FFFFFF', '#FF5555', '#4285F4', '#34A853', '#FBBC05'];
try {
    const savedColors = localStorage.getItem('prismax_colors');
    if (savedColors) GLOBAL_SWATCHES = JSON.parse(savedColors);
} catch(e) { console.warn("Swatches reset"); }

const pickrInstances = [];
window.isSpaceKeyDown = false;

function setPickerColor(id, hex) {
    const el = document.getElementById(id);
    if (!el || !hex) return;
    
    if (typeof hex !== 'string') {
        hex = '#000000';
    }
    
    if (hex.startsWith('#') && hex.length === 9) {
        hex = hex.substring(0, 7);
    }
    
    if (hex === 'transparent' || hex === 'none') {
        el.value = '#ffffff';
    } else {
        el.value = hex;
    }
    
    if (el._pickr) {
        if (hex === 'transparent' || hex === 'none') {
            try {
                el._pickr.setColor('#ffffff', true); // set a neutral white silently
            } catch(e) {}
        } else {
            try {
                // Pass true as the second argument to Pickr's setColor to trigger it SILENTLY (without emitting change events)
                el._pickr.setColor(hex, true); 
            } catch(e) {
                console.warn("Pickr setColor error:", e);
            }
        }
    }
}

function initPickers() {
    if (typeof Pickr === 'undefined') {
        console.error("Pickr library failed to load. Falling back to native inputs.");
        return;
    }
    
    try {
        document.querySelectorAll('input[type="color"]').forEach(input => {
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-pickr-btn';
            wrapper.style.display = 'inline-block';
            input.parentNode.insertBefore(wrapper, input);
            input.style.display = 'none'; // hide native

            const p = Pickr.create({
            el: wrapper,
            theme: 'nano',
            default: input.value || '#D4AF37',
            swatches: GLOBAL_SWATCHES,
            components: {
                preview: true,
                opacity: false,
                hue: true,
                interaction: {
                    hex: false, rgba: false, hsla: false, hsva: false, cmyk: false,
                    input: true,
                    clear: false,
                    save: true
                }
            }
        });

        p.on('save', (color) => {
            if(!color) return;
            let hex = color.toHEXA().toString();
            if (hex.startsWith('#') && hex.length === 9) {
                hex = hex.substring(0, 7);
            }
            if(!GLOBAL_SWATCHES.includes(hex)) {
                GLOBAL_SWATCHES.push(hex);
                localStorage.setItem('prismax_colors', JSON.stringify(GLOBAL_SWATCHES));
                pickrInstances.forEach(pi => pi.addSwatch(hex));
            }
            p.hide();
        });

        p.on('change', (color) => {
            if (window.isUpdatingPropsPanel) return;
            let hex = color.toHEXA().toString();
            if (hex.startsWith('#') && hex.length === 9) {
                hex = hex.substring(0, 7);
            }
            if(input.value !== hex) {
                input.value = hex;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        p.on('changestop', () => {
            if (window.isUpdatingPropsPanel) return;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        input._pickr = p;
        pickrInstances.push(p);
    });
    } catch(e) {
        console.error("Pickr failed gracefully.", e);
    }
}

function initUI() {
    initQuickToolbar();
    initTemplates();

    document.querySelectorAll('.nav-tab[data-target]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.dataset.target === 'panel_templates') {
                e.preventDefault();
                openTemplatesModal();
                return;
            }
            if (btn.dataset.target === 'panel_ai') {
                e.preventDefault();
                openAIModal();
                return;
            }
            document.querySelectorAll(`.nav-tab[data-target="${btn.dataset.target}"]`).forEach(t => t.classList.add('active'));
            switchTab(btn.dataset.target, btn.innerText.trim());
        });
    });

    // Close sheets for both sidebars on mobile
    document.querySelectorAll('.close-sheet').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('right_sidebar').classList.remove('sheet-open');
            document.getElementById('left_sidebar').classList.remove('sheet-open');
            // Remove active states from tabs so they can be clicked again
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            if (isMobile) {
                document.getElementById('mobile_tabs').style.display = 'flex';
                // Keep mini-toolbar visible
            }
        });
    });

    // Sub tabs
    document.querySelectorAll('.sub-tab').forEach(t => {
        t.addEventListener('click', () => {
            t.parentElement.querySelectorAll('.sub-tab').forEach(btn => btn.classList.remove('active'));
            t.classList.add('active');
            const targetId = t.dataset.sub;
            t.parentElement.parentElement.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Download Bindings (Open Studio Export Settings Modal)
    const openExportModal = () => {
        const modal = document.getElementById('export_modal');
        if (modal) {
            modal.classList.remove('hidden');
            if (isMobile) {
                history.pushState({ modal: 'export' }, '');
            }
        }
    };
    window.closeExportModal = (viaPopstate = false) => {
        const modal = document.getElementById('export_modal');
        if (modal) modal.classList.add('hidden');
        if (!viaPopstate && isMobile) {
            history.back();
        }
    };
    document.getElementById('btn_top_download')?.addEventListener('click', openExportModal);
    document.getElementById('btn_mobile_download')?.addEventListener('click', openExportModal);

    // Export Settings Modal Controls
    document.getElementById('btn_close_export_modal')?.addEventListener('click', () => {
        closeExportModal();
    });

    const pngRadio = document.getElementById('export_format_png');
    const mp4Radio = document.getElementById('export_format_mp4');
    const pngLbl = document.getElementById('export_format_png_lbl');
    const mp4Lbl = document.getElementById('export_format_mp4_lbl');
    const videoSettings = document.getElementById('video_export_settings');

    pngLbl?.addEventListener('click', () => {
        if (pngRadio) pngRadio.checked = true;
        pngLbl.style.background = 'rgba(0,0,0,0.3)';
        pngLbl.style.border = '2px solid var(--border-gold)';
        if (mp4Lbl) {
            mp4Lbl.style.background = 'rgba(0,0,0,0.1)';
            mp4Lbl.style.border = '2px solid rgba(255,255,255,0.05)';
        }
        if (videoSettings) videoSettings.classList.add('hidden');
    });

    mp4Lbl?.addEventListener('click', () => {
        if (mp4Radio) mp4Radio.checked = true;
        if (mp4Lbl) {
            mp4Lbl.style.background = 'rgba(0,0,0,0.3)';
            mp4Lbl.style.border = '2px solid var(--border-gold)';
        }
        if (pngLbl) {
            pngLbl.style.background = 'rgba(0,0,0,0.1)';
            pngLbl.style.border = '2px solid rgba(255,255,255,0.05)';
        }
        if (videoSettings) videoSettings.classList.remove('hidden');
    });

    document.getElementById('btn_confirm_export')?.addEventListener('click', () => {
        const isVideo = mp4Radio && mp4Radio.checked;
        const res = document.getElementById('export_resolution').value;
        const modal = document.getElementById('export_modal');
        if (modal) modal.classList.add('hidden');

        if (isVideo) {
            recordCinematicVideo(res);
        } else {
            downloadCanvas(res);
        }
    });

    // Tools
    document.getElementById('btn_add_heading')?.addEventListener('click', () => addText('h1'));
    document.getElementById('btn_add_subheading')?.addEventListener('click', () => addText('h2'));
    document.getElementById('btn_add_body')?.addEventListener('click', () => addText('body'));
    document.getElementById('btn_ratio_change')?.addEventListener('click', () => {
        const hasObjects = canvas && canvas.getObjects().length > 0;
        if (hasObjects) {
            if (!confirm('⚠️ Changing the canvas ratio will CLEAR all your current work.\n\nAre you sure you want to continue?')) {
                return;
            }
        }
        document.getElementById('startup_modal').classList.remove('hidden');
    });
    document.getElementById('btn_reset_studio')?.addEventListener('click', resetStudio);

    // Layers & History
    document.getElementById('btn_undo')?.addEventListener('click', undo);
    document.getElementById('btn_redo')?.addEventListener('click', redo);
    document.getElementById('btn_bring_front')?.addEventListener('click', () => bringLayer('front'));
    document.getElementById('btn_send_back')?.addEventListener('click', () => bringLayer('back'));
    document.getElementById('btn_prop_bring_front')?.addEventListener('click', () => bringLayer('front'));
    document.getElementById('btn_prop_send_back')?.addEventListener('click', () => bringLayer('back'));
    document.getElementById('btn_delete')?.addEventListener('click', deleteSelected);
    document.getElementById('btn_duplicate')?.addEventListener('click', duplicateSelected);

    document.getElementById('btn_group')?.addEventListener('click', toggleGroup);
    document.getElementById('btn_save_progress')?.addEventListener('click', mergeAllLayers);
    document.getElementById('btn_play_anim')?.addEventListener('click', playIntroAnimation);

    // Arrow tool init
    document.getElementById('btn_add_arrow')?.addEventListener('click', function () {
        isArrowMode = !isArrowMode;
        showToast(isArrowMode ? "Arrow Mode: Tap two elements to connect" : "Arrow Mode Disabled");
        if (isArrowMode) {
            this.classList.add('active');
            this.style.background = 'var(--bg-dark)';
            this.style.color = 'var(--primary-gold)';
            this.style.border = '1px solid var(--primary-gold)';
            canvas.discardActiveObject();
            canvas.requestRenderAll();
            firstArrowTarget = null;
        } else {
            this.classList.remove('active');
            this.style.background = '';
            this.style.color = '';
            this.style.border = '';
        }
    });

    document.getElementById('btn_add_rect')?.addEventListener('click', () => addShape('rect'));
    document.getElementById('btn_add_rounded_rect')?.addEventListener('click', () => addShape('rounded_rect'));
    document.getElementById('btn_add_circle')?.addEventListener('click', () => addShape('circle'));
    document.getElementById('btn_add_ring')?.addEventListener('click', () => addShape('ring'));
    document.getElementById('btn_add_diamond')?.addEventListener('click', () => addShape('diamond'));
    document.getElementById('btn_add_triangle')?.addEventListener('click', () => addShape('triangle'));
    document.getElementById('btn_add_triangle_down')?.addEventListener('click', () => addShape('triangle_down'));
    document.getElementById('btn_add_triangle_right')?.addEventListener('click', () => addShape('triangle_right'));
    document.getElementById('btn_add_pentagon')?.addEventListener('click', () => addShape('pentagon'));
    document.getElementById('btn_add_hexagon')?.addEventListener('click', () => addShape('hexagon'));
    document.getElementById('btn_add_octagon')?.addEventListener('click', () => addShape('octagon'));
    document.getElementById('btn_add_star')?.addEventListener('click', () => addShape('star'));
    document.getElementById('btn_add_star4')?.addEventListener('click', () => addShape('star4'));
    document.getElementById('btn_add_star6')?.addEventListener('click', () => addShape('star6'));
    document.getElementById('btn_add_cross')?.addEventListener('click', () => addShape('cross'));
    document.getElementById('btn_add_parallelogram')?.addEventListener('click', () => addShape('parallelogram'));
    document.getElementById('btn_add_heart')?.addEventListener('click', () => addShape('heart'));
    document.getElementById('btn_add_cloud')?.addEventListener('click', () => addShape('cloud'));
    document.getElementById('btn_add_lightning')?.addEventListener('click', () => addShape('lightning'));
    document.getElementById('btn_add_moon')?.addEventListener('click', () => addShape('moon'));
    document.getElementById('btn_add_speech')?.addEventListener('click', () => addShape('speech'));
    document.getElementById('btn_add_badge')?.addEventListener('click', () => addShape('badge'));
    document.getElementById('btn_add_shield')?.addEventListener('click', () => addShape('shield'));
    document.getElementById('btn_add_explosion')?.addEventListener('click', () => addShape('explosion'));
    document.getElementById('btn_add_arrow_right')?.addEventListener('click', () => addShape('arrow_right'));
    document.getElementById('btn_add_arrow_left')?.addEventListener('click', () => addShape('arrow_left'));
    document.getElementById('btn_add_arrow_up')?.addEventListener('click', () => addShape('arrow_up'));
    document.getElementById('btn_add_arrow_down')?.addEventListener('click', () => addShape('arrow_down'));
    document.getElementById('btn_add_chevron_right')?.addEventListener('click', () => addShape('chevron_right'));
    document.getElementById('btn_add_double_arrow')?.addEventListener('click', () => addShape('double_arrow'));
    document.getElementById('btn_add_curved_arrow')?.addEventListener('click', () => addShape('curved_arrow'));
    document.getElementById('btn_add_bend_arrow')?.addEventListener('click', () => addShape('bend_arrow'));
    document.getElementById('btn_add_line')?.addEventListener('click', () => addShape('line'));
    document.getElementById('btn_add_dashed_line')?.addEventListener('click', () => addShape('dashed_line'));
    document.getElementById('btn_add_dotted_line')?.addEventListener('click', () => addShape('dotted_line'));
    document.getElementById('btn_add_thick_line')?.addEventListener('click', () => addShape('thick_line'));
    document.getElementById('btn_add_bracket_left')?.addEventListener('click', () => addShape('bracket_left'));
    document.getElementById('btn_add_bracket_right')?.addEventListener('click', () => addShape('bracket_right'));
    document.getElementById('btn_add_divider_ornate')?.addEventListener('click', () => addShape('divider_ornate'));
    document.getElementById('btn_add_wave_line')?.addEventListener('click', () => addShape('wave_line'));
    document.getElementById('btn_add_checkmark')?.addEventListener('click', () => addShape('checkmark'));
    document.getElementById('btn_add_xmark')?.addEventListener('click', () => addShape('xmark'));
    document.getElementById('btn_add_location')?.addEventListener('click', () => addShape('location'));
    document.getElementById('btn_add_bookmark')?.addEventListener('click', () => addShape('bookmark'));
    document.getElementById('btn_add_ribbon')?.addEventListener('click', () => addShape('ribbon'));
    document.getElementById('btn_add_trophy')?.addEventListener('click', () => addShape('trophy'));
    document.getElementById('btn_add_crown')?.addEventListener('click', () => addShape('crown'));
    document.getElementById('btn_add_fire')?.addEventListener('click', () => addShape('fire'));

    document.getElementById('btn_add_free_arrow')?.addEventListener('click', addFreeArrow);

    // Wire up frame sidebar buttons click listeners
    const frameButtonsList = [
        'circle', 'rectangle', 'long_rect', 'square', 'oval',
        'cloud', 'flower', 'heart', 'star', 'hexagon',
        'shield', 'speech', 'laptop', 'phone', 'triangle',
        'octagon', 'badge', 'moon', 'diamond'
    ];
    frameButtonsList.forEach(type => {
        document.getElementById(`btn_frame_${type}`)?.addEventListener('click', () => {
            addFrameToCanvas(type);
        });
    });

    // Color Swatches Init
    updateRecentColorsUI();
    document.querySelectorAll('input[type="color"]').forEach(input => {
        input.addEventListener('change', (e) => {
            if (e.target.value) {
                recentColors.add(e.target.value);
                updateRecentColorsUI();
            }
        });
    });

    // Zoom Controls
    document.getElementById('btn_zoom_in')?.addEventListener('click', () => {
        let zoom = canvas.getZoom() * 1.1;
        if (zoom > 20) zoom = 20;
        canvas.zoomToPoint({ x: canvas.width / 2, y: canvas.height / 2 }, zoom);
        updateZoomDisplay();
    });

    document.getElementById('btn_zoom_out')?.addEventListener('click', () => {
        const panelW = document.getElementById('workspace_inner').clientWidth;
        const panelH = document.getElementById('workspace_inner').clientHeight;
        const baseScale = Math.min((panelW - 40) / virtualFormat.w, (panelH - 40) / virtualFormat.h);

        let zoom = canvas.getZoom() / 1.1;
        if (zoom < baseScale) zoom = baseScale;
        canvas.zoomToPoint({ x: canvas.width / 2, y: canvas.height / 2 }, zoom);
        limitPan();
        updateZoomDisplay();
    });

    document.getElementById('zoom_display')?.addEventListener('click', () => {
        // Reset Zoom & Pan
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        resizeCanvas(false);
        updateZoomDisplay();
    });

    // Theme Toggles
    const toggleTheme = () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        showToast(isLight ? "Switched to Light Mode" : "Switched to Prisma X Dark Mode");
        
        const logoImg = document.querySelector('.brand-title-img img');
        if (logoImg) {
            logoImg.src = isLight ? 'assets/logos/logo-prismax-01.png' : 'assets/logos/logo-prismax-02.png';
        }
    };
    document.getElementById('btn_theme_toggle_desk')?.addEventListener('click', toggleTheme);
    document.getElementById('btn_theme_toggle_mob')?.addEventListener('click', toggleTheme);

    // Asset Search
    const searchInput = document.getElementById('asset_search_input');
    const searchBtn = document.getElementById('btn_do_search');
    const clearBtn = document.getElementById('btn_clear_search');

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performAssetSearch(searchInput.value);
        });
        if (searchBtn) searchBtn.addEventListener('click', () => performAssetSearch(searchInput.value));
        if (clearBtn) clearBtn.addEventListener('click', clearAssetSearch);
    }

    // Property Bindings
    bindPropertiesPanel();
}

function startStudio(w, h, savedState = null) {
    try {
        console.log('[startStudio] Starting with', w, 'x', h);
        virtualFormat.w = w;
        virtualFormat.h = h;
        localStorage.setItem('prismax_ratio', JSON.stringify(virtualFormat));

        document.getElementById('startup_modal').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');

        if (!canvas) {
            initFabric();
        }

        // Use requestAnimationFrame to ensure the browser has computed layout
        // after unhiding the #app container. Without this, workspace dimensions
        // may be 0 on mobile, causing resizeCanvas to bail out.
        const finishInit = () => {
            try {
                if (savedState) {
                    isHistoryAction = true;
                    try {
                        const parsed = JSON.parse(savedState);
                        if (parsed && parsed.canvas) {
                            loadHistory(savedState);
                            return;
                        }
                    } catch (e) {
                        // Not structured v2 state, fallback to direct JSON load
                    }
                    
                    canvas.loadFromJSON(savedState, () => {
                        resizeCanvas(false);
                        isHistoryAction = false;
                        canvas.requestRenderAll();
                        updateLayersPanel();
                        showToast("Project Recovered! ✨");
                    });
                } else {
                    resizeCanvas(true);
                    saveHistory(); // Initial state
                }
                console.log('[startStudio] Init complete.');
            } catch (innerErr) {
                console.error('[startStudio] Error during canvas init:', innerErr);
            }
        };

        // Double-RAF ensures layout is fully computed even on slow mobile browsers
        requestAnimationFrame(() => {
            requestAnimationFrame(finishInit);
        });
    } catch (err) {
        console.error('[startStudio] FATAL:', err);
        // Emergency: still unhide app so user is not stuck
        document.getElementById('startup_modal')?.classList.add('hidden');
        document.getElementById('app')?.classList.remove('hidden');
    }
}

function resetStudio() {
    if (confirm("Are you sure? This will delete your current design and start fresh.")) {
        localStorage.removeItem('prismax_design_v2');
        localStorage.removeItem('prismax_design');
        localStorage.removeItem('prismax_ratio');
        localStorage.removeItem('prismax_colors');
        location.reload();
    }
}

function initFabric() {
    canvas = new fabric.Canvas('c', {
        preserveObjectStacking: true,
        selectionColor: 'rgba(212, 175, 55, 0.3)',
        selectionBorderColor: '#D4AF37',
        selectionLineWidth: 2
    });

    // Deselect all elements when clicking/tapping outside the canvas and UI containers
    window.addEventListener('pointerdown', (e) => {
        if (!canvas) return;
        
        try {
            let target = e.target;
            let clickedInsideUI = false;
            
            while (target && target !== document.body) {
                const hasClass = (className) => target.classList && typeof target.classList.contains === 'function' && target.classList.contains(className);
                
                if (target.id === 'c' || 
                    hasClass('canvas-container') || 
                    target.id === 'canvas_container' ||
                    target.id === 'left_sidebar' || 
                    target.id === 'right_sidebar' || 
                    hasClass('sidebar') ||
                    target.id === 'mobile_bottom_nav' || 
                    target.id === 'mob_object_bar' || 
                    target.id === 'quick_access_toolbar' || 
                    hasClass('mobile-nav') || 
                    hasClass('mobile-sub-tabs') ||
                    hasClass('modal-overlay') || 
                    hasClass('templates-modal-container') || 
                    hasClass('sweet-alert') ||
                    hasClass('sp-container') ||
                    hasClass('clr-picker') ||
                    hasClass('toastify') ||
                    hasClass('toast') ||
                    target.tagName === 'INPUT' || 
                    target.tagName === 'SELECT' || 
                    target.tagName === 'BUTTON' || 
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'OPTION' ||
                    target.tagName === 'A' ||
                    hasClass('btn') ||
                    hasClass('nav-tab') ||
                    hasClass('template-cat-pill') ||
                    hasClass('sub-tab') ||
                    hasClass('asset-item') ||
                    hasClass('template-card')) {
                    clickedInsideUI = true;
                    break;
                }
                target = target.parentElement;
            }
            
            if (!clickedInsideUI) {
                if (canvas.getActiveObject()) {
                    canvas.discardActiveObject();
                    canvas.requestRenderAll();
                }
            }
        } catch (err) {
            console.error("[Pointer Listener Error]", err);
        }
    });

    // Custom Corner styling for mobile friendliness (min 44px targets physically, adjust control visual)
    fabric.Object.prototype.set({
        transparentCorners: false,
        cornerColor: '#D4AF37',
        cornerStrokeColor: '#0a0500',
        borderColor: '#D4AF37',
        cornerSize: isMobile ? 24 : 12,
        padding: 10,
        cornerStyle: 'circle'
    });

    // Custom Rotation icon just above the element
    const rotateImg = new Image();
    rotateImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%230a0500' d='M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z'/%3E%3C/svg%3E";

    // Custom Delete icon
    const deleteImg = new Image();
    deleteImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ff4444' d='M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4zM6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z'/%3E%3C/svg%3E";

    if (fabric.Object.prototype.controls && fabric.Object.prototype.controls.mtr) {
        fabric.Object.prototype.controls.mtr.cursorStyle = 'grab';
        fabric.Object.prototype.controls.mtr.offsetX = 22; // shift rotate control right
        fabric.Object.prototype.controls.mtr.render = function (ctx, left, top, styleOverride, fabricObject) {
            const size = isMobile ? 32 : 24;
            ctx.save();
            ctx.translate(left, top);
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = '#D4AF37';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#0a0500';
            ctx.stroke();
            if (rotateImg.complete) {
                // Draw the icon centered
                ctx.drawImage(rotateImg, -size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
            }
            ctx.restore();
        }

        // Add Delete Control
        fabric.Object.prototype.controls.deleteControl = new fabric.Control({
            x: 0,
            y: -0.5,
            offsetY: -40,
            offsetX: -22, // shift delete control left
            cursorStyle: 'pointer',
            mouseUpHandler: function (eventData, transform) {
                let target = transform.target;
                let canvas = target.canvas;
                if (typeof deleteSelected === 'function' && canvas.getActiveObject() === target) {
                    deleteSelected();
                } else {
                    canvas.remove(target);
                    canvas.requestRenderAll();
                }
                return true;
            },
            render: function (ctx, left, top, styleOverride, fabricObject) {
                const size = isMobile ? 32 : 24;
                ctx.save();
                ctx.translate(left, top);
                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, 2 * Math.PI, false);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = '#ff4444';
                ctx.stroke();
                if (deleteImg.complete) {
                    ctx.drawImage(deleteImg, -size / 2 + 4, -size / 2 + 4, size - 8, size - 8);
                }
                ctx.restore();
            },
            cornerSize: 24
        });
    }

    // Arrow mode connection handler
    canvas.on('mouse:down', function (options) {
        if (isArrowMode && options.target) {
            if (!firstArrowTarget) {
                firstArrowTarget = options.target;
                if (!firstArrowTarget.id) firstArrowTarget.id = 'obj_' + Date.now();
                showToast("Now tap second element to complete arrow");
            } else {
                if (firstArrowTarget !== options.target) {
                    if (!options.target.id) options.target.id = 'obj_' + Date.now();
                    drawConnection(firstArrowTarget, options.target);
                }
                isArrowMode = false;
                firstArrowTarget = null;
                showToast("Connected!");
            }
        }
    });

    canvas.on('selection:created', (e) => {
        // If arrow line/head is selected, redirect to control point
        const sel = canvas.getActiveObject();
        if (sel && (sel.isArrowLine || sel.isArrowHead)) {
            const conn = connections.find(c => c.lineId === sel.connId);
            if (conn && conn.cp) {
                canvas.setActiveObject(conn.cp);
                conn.cp.set({ opacity: 0.5 });
                conn.cp.bringToFront();
                canvas.requestRenderAll();
            }
        }

        updateConnections(); updatePropsPanel(); updateLayersPanel(); updateMobileObjectBar();
    });
    canvas.on('selection:updated', (e) => {
        const sel = canvas.getActiveObject();
        if (sel && (sel.isArrowLine || sel.isArrowHead)) {
            const conn = connections.find(c => c.lineId === sel.connId);
            if (conn && conn.cp) {
                canvas.setActiveObject(conn.cp);
                conn.cp.set({ opacity: 0.5 });
                conn.cp.bringToFront();
                canvas.requestRenderAll();
            }
        }

        updateConnections(); updatePropsPanel(); updateLayersPanel(); updateMobileObjectBar();
    });
    canvas.on('selection:cleared', (e) => { updateConnections(); updatePropsPanel(); updateLayersPanel(); updateMobileObjectBar(); });

    canvas.on('object:modified', () => { updatePropsPanel(); saveHistory(); updateLayersPanel(); });
    canvas.on('object:added', () => { if (!isHistoryAction) { saveHistory(); updateLayersPanel(); } });
    canvas.on('object:removed', () => { if (!isHistoryAction) { saveHistory(); updateLayersPanel(); } });

    // ========== DRAG AND DROP OBJECT SNAP LOGIC (CANVA STYLE) ==========
    canvas.on('object:moving', (opt) => {
        const active = opt.target;
        if (active && active.type === 'image' && !active.isFrame) {
            const centerPoint = active.getCenterPoint();
            const targetFrame = findFrameAtPointer(centerPoint);
            
            // Clear hover highlights on all frames
            canvas.getObjects().forEach(o => {
                if (o.isFrame) {
                    ensureFrameRefs(o);
                    if (o.fillShape) {
                        const hasImg = o.getObjects().some(child => child.type === 'image');
                        o.fillShape.set('fill', hasImg ? 'transparent' : 'rgba(212, 175, 55, 0.12)');
                    }
                }
            });
            
            // Highlight frame when hovered
            if (targetFrame && targetFrame.fillShape) {
                targetFrame.fillShape.set('fill', 'rgba(212, 175, 55, 0.28)'); // Glow!
                canvas.requestRenderAll();
            }
        }
    });

    canvas.on('mouse:up', (opt) => {
        const active = canvas.getActiveObject();
        
        // Reset highlights
        canvas.getObjects().forEach(o => {
            if (o.isFrame) {
                ensureFrameRefs(o);
                if (o.fillShape) {
                    const hasImg = o.getObjects().some(child => child.type === 'image');
                    o.fillShape.set('fill', hasImg ? 'transparent' : 'rgba(212, 175, 55, 0.12)');
                }
            }
        });
        
        if (active && active.type === 'image' && !active.isFrame) {
            const centerPoint = active.getCenterPoint();
            const targetFrame = findFrameAtPointer(centerPoint);
            if (targetFrame) {
                const src = active._element?.src || active.src || (typeof active.getSrc === 'function' ? active.getSrc() : null);
                if (src) {
                    fabric.Image.fromURL(src, (newImg) => {
                        insertImageIntoFrame(targetFrame, newImg, src);
                        canvas.remove(active);
                        canvas.discardActiveObject();
                        canvas.requestRenderAll();
                        showToast("📷 Snapped inside the sketchy frame!");
                    });
                }
            }
        }
        canvas.requestRenderAll();
    });

    canvas.on('text:editing:entered', (e) => {
        let a = e.target;
        if (a) {
            a._originalTextBeforeEdit = a.text;
        }
    });

    canvas.on('text:editing:exited', (e) => {
        let a = e.target;
        if (a) {
            a.editable = false;
        }
        if (a && a.text !== a._originalTextBeforeEdit) {
            saveHistory();
            updateLayersPanel();
        }
    });

    canvas.on('mouse:dblclick', (options) => {
        const active = options.target;
        if (active && isTextObject(active)) {
            active.editable = true;
            active.enterEditing();
            if (active.hiddenTextarea) {
                active.hiddenTextarea.focus();
            }
        }
    });

    canvas.on('text:changed', function(e) {
        let a = e.target;
        if (!a || !isTextObject(a)) return;
        
        let lines = a.text.split('\n');
        let isBullet = lines.length > 0 && lines[0].startsWith('• ');
        let isNumber = lines.length > 0 && /^\d+\.\s/.test(lines[0]);
        
        let prevText = a._prevText || '';
        if ((isBullet || isNumber) && a.text.length > prevText.length) {
            // Adaptive line break appending
            if (a.text.length - prevText.length === 1 && a.text.includes('\n')) {
                let newLines = [...lines];
                let modified = false;
                let addedLength = 0;
                
                for (let i = 0; i < newLines.length; i++) {
                    if (newLines[i] === '') {
                        if (isBullet) {
                            newLines[i] = '• ';
                            addedLength = 2;
                        } else if (isNumber) {
                            newLines[i] = (i + 1) + '. ';
                            addedLength = newLines[i].length;
                        }
                        modified = true;
                    } else if (isNumber && newLines[i].match(/^\d+\.\s/)) {
                        // Automatically recalculate remaining numbers correctly
                        newLines[i] = newLines[i].replace(/^\d+\.\s/, (i + 1) + '. ');
                    }
                }
                
                if (modified) {
                    let sStart = a.selectionStart;
                    a.text = newLines.join('\n');
                    a.selectionStart = sStart + addedLength;
                    a.selectionEnd = a.selectionStart;
                    canvas.requestRenderAll();
                }
            }
        }
        
        a._prevText = a.text;
        updatePropsPanel();
    });

    canvas.on('object:moving', (e) => {
        updateConnections();
        if (!e.target.isControlPoint && !e.target.isArrowAnchor) {
            snapCenter(e.target);
        }
    });

    canvas.on('object:scaling', (e) => { 
        updateConnections(); 
        updateLayersPanel(); 
        if (e.target) {
            if (e.target.type === 'rect') {
                const el = document.getElementById('prop_corner_radius');
                const r = el && el.value !== "" ? parseFloat(el.value) : 0;
                e.target.set('rx', r / e.target.scaleX);
                e.target.set('ry', r / e.target.scaleY);
            } else if ((e.target.type === 'image' || e.target.type === 'group') && e.target.customCornerRadius !== undefined) {
                const r = e.target.customCornerRadius;
                if (r > 0) {
                    const clipPath = new fabric.Rect({
                        width: e.target.width,
                        height: e.target.height,
                        rx: r / e.target.scaleX,
                        ry: r / e.target.scaleY,
                        originX: 'center',
                        originY: 'center'
                    });
                    e.target.set('clipPath', clipPath);
                }
            }
        }
    });
    canvas.on('mouse:up', () => clearSnapGuides());

    // --- PC Zoom & Pan ---
    canvas.on('mouse:wheel', function (opt) {
        const panelW = document.getElementById('workspace_inner').clientWidth;
        const panelH = document.getElementById('workspace_inner').clientHeight;
        const baseScale = Math.min((panelW - 40) / virtualFormat.w, (panelH - 40) / virtualFormat.h);

        var delta = opt.e.deltaY;
        var zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;

        // Constraints: 100% (baseScale) to 300% (baseScale * 3)
        if (zoom < baseScale) zoom = baseScale;
        if (zoom > baseScale * 3) zoom = baseScale * 3;

        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        limitPan();
        updateZoomDisplay();
        opt.e.preventDefault();
        opt.e.stopPropagation();
    });

    let isPanning = false;
    let lastPosX, lastPosY;
    canvas.on('mouse:down', function (opt) {
        var evt = opt.e;
        if (evt.altKey || evt.button === 1 || window.isSpaceKeyDown) {
            isPanning = true;
            canvas.selection = false;
            lastPosX = evt.clientX || (evt.touches ? evt.touches[0].clientX : 0);
            lastPosY = evt.clientY || (evt.touches ? evt.touches[0].clientY : 0);
        }
    });
    canvas.on('mouse:move', function (opt) {
        if (isPanning) {
            var e = opt.e;
            var vpt = canvas.viewportTransform;
            var clientX = e.clientX || (e.touches ? e.touches[0].clientX : lastPosX);
            var clientY = e.clientY || (e.touches ? e.touches[0].clientY : lastPosY);
            vpt[4] += clientX - lastPosX;
            vpt[5] += clientY - lastPosY;
            limitPan();
            canvas.requestRenderAll();
            lastPosX = clientX;
            lastPosY = clientY;
        }
    });
    canvas.on('mouse:up', function (opt) {
        if (isPanning) {
            canvas.setViewportTransform(canvas.viewportTransform);
            isPanning = false;
        }
        canvas.selection = true; // Always restore selection logic on release
    });

    // --- Mobile Pinch to Zoom & Pan ---
    let touchHandler = { isPinching: false, initialDist: 0, initialZoom: 1, lastCenter: null };
    canvas.upperCanvasEl.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
            touchHandler.isPinching = true;
            let dx = e.touches[0].clientX - e.touches[1].clientX;
            let dy = e.touches[0].clientY - e.touches[1].clientY;
            touchHandler.initialDist = Math.sqrt(dx * dx + dy * dy);
            touchHandler.initialZoom = canvas.getZoom();
            touchHandler.lastCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
        }
    }, { passive: false });

    canvas.upperCanvasEl.addEventListener('touchmove', function (e) {
        if (touchHandler.isPinching && e.touches.length === 2) {
            e.preventDefault();
            e.stopPropagation();
            let dx = e.touches[0].clientX - e.touches[1].clientX;
            let dy = e.touches[0].clientY - e.touches[1].clientY;
            let dist = Math.sqrt(dx * dx + dy * dy);

            const panelW = document.getElementById('workspace_inner').clientWidth;
            const panelH = document.getElementById('workspace_inner').clientHeight;
            const baseScale = Math.min((panelW - 40) / virtualFormat.w, (panelH - 40) / virtualFormat.h);

            let zoom = touchHandler.initialZoom * (dist / touchHandler.initialDist);

            // Constraints: 100% (baseScale) to 300% (baseScale * 3)
            if (zoom < baseScale) zoom = baseScale;
            if (zoom > baseScale * 3) zoom = baseScale * 3;

            let centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            let centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            let rect = canvas.upperCanvasEl.getBoundingClientRect();
            let point = { x: centerX - rect.left, y: centerY - rect.top };

            canvas.zoomToPoint(point, zoom);

            let vpt = canvas.viewportTransform;
            vpt[4] += centerX - touchHandler.lastCenter.x;
            vpt[5] += centerY - touchHandler.lastCenter.y;

            // Apply panning limits to keep canvas in view
            limitPan();

            canvas.requestRenderAll();
            updateZoomDisplay();

            touchHandler.lastCenter = { x: centerX, y: centerY };
        }
    }, { passive: false });

    canvas.upperCanvasEl.addEventListener('touchend', function (e) {
        if (e.touches.length < 2) {
            touchHandler.isPinching = false;
            touchHandler.lastCenter = null;
        }
    });
}

function updateZoomDisplay() {
    const display = document.getElementById('zoom_display');
    if (display && canvas) {
        // Calculate relative zoom based on the current fitted scale vs actual virtual format
        const panelW = document.getElementById('workspace_inner').clientWidth;
        const panelH = document.getElementById('workspace_inner').clientHeight;
        const baseScale = Math.min((panelW - 40) / virtualFormat.w, (panelH - 40) / virtualFormat.h);

        const relativeZoom = Math.round((canvas.getZoom() / baseScale) * 100);
        display.innerText = `${relativeZoom}%`;
    }
}

function handleResize() {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;
    isMobile = newWidth < 768;
    window.isMobile = isMobile;

    // KEYBOARD POPUP / ADDRESS BAR DETECTION (Mobile Only)
    // If the width of the viewport hasn't changed, it is a vertical-only resize
    // (caused by virtual keyboard opening/closing or browser address bar hiding/showing).
    // In this case, we MUST preserve the user's custom zoom and pan, and avoid resetting the canvas.
    if (isMobile && newWidth === lastWidth) {
        console.log("[Studio] Vertical-only resize on mobile - preserving zoom and layout");
        lastHeight = newHeight;
        if (canvas) {
            limitPan();
            canvas.requestRenderAll();
        }
        return;
    }

    lastWidth = newWidth;
    lastHeight = newHeight;

    if (canvas) {
        resizeCanvas(false);
        canvas.calcOffset(); // Crucial for ensuring mouse events hit the right coordinates
    }
}

function limitPan() {
    if (!canvas) return;
    const vpt = canvas.viewportTransform;
    const zoom = canvas.getZoom();

    // actual design pixels on device
    const designW = virtualFormat.w * zoom;
    const designH = virtualFormat.h * zoom;

    // canvas box size
    const canvasW = canvas.width;
    const canvasH = canvas.height;

    // IF AT BASE ZOOM (OR SMALLER), FORCE CENTERED AT 0,0 RELATIVE TO CANVAS TAG
    // We rely on CSS to center the #canvas_container div in the workspace.
    // Inside the canvas tag, the design should fill it perfectly.
    if (designW <= canvasW + 1) {
        vpt[4] = 0;
    } else {
        // Panning boundaries: don't let design center move past the point where we see empty space
        if (vpt[4] > 0) vpt[4] = 0;
        if (vpt[4] < canvasW - designW) vpt[4] = canvasW - designW;
    }

    if (designH <= canvasH + 1) {
        vpt[5] = 0;
    } else {
        if (vpt[5] > 0) vpt[5] = 0;
        if (vpt[5] < canvasH - designH) vpt[5] = canvasH - designH;
    }
}

function resizeCanvas(reset) {
    if (!canvas) return;
    const parent = document.getElementById('canvas_container');
    const workspace = document.getElementById('workspace_inner');
    if (!workspace) return;

    const panelW = workspace.clientWidth;
    const panelH = workspace.clientHeight;

    if (panelW < 50 || panelH < 50) return;

    // Use a fixed margin of 40px for the design area boundary
    const fitScale = Math.min(
        (panelW - 40) / virtualFormat.w,
        (panelH - 40) / virtualFormat.h
    );

    const displayW = virtualFormat.w * fitScale;
    const displayH = virtualFormat.h * fitScale;

    parent.style.width = displayW + 'px';
    parent.style.height = displayH + 'px';

    canvas.setDimensions({ width: displayW, height: displayH });
    canvas.calcOffset();

    // Fit everything perfectly inside the canvas element
    canvas.setViewportTransform([fitScale, 0, 0, fitScale, 0, 0]);
    updateZoomDisplay();

    if (reset) {
        canvas.clear();
        canvas.setBackgroundColor('rgba(255,255,255,0)', canvas.renderAll.bind(canvas));
        connections = [];
        historyStack = [];
        redoStack = [];
    }
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.remove('hidden');
    t.style.opacity = 1;
    setTimeout(() => {
        t.style.opacity = 0;
        setTimeout(() => t.classList.add('hidden'), 300);
    }, 2500);
}

// ============================
// TOOLS & ASSETS
// ============================

async function loadAssets() {
    console.log("[Studio] Dispatching asset fetch...");
    try {
        const response = await fetch('/api/assets?t=' + Date.now());
        if (!response.ok) throw new Error(`Server API returned ${response.status}`);

        const data = await response.json();
        console.log("[Studio] Data fetched successfully:", data);

        const backgroundsGrid = document.getElementById('grid_backgrounds');
        const backgroundsGallery = document.getElementById('grid_backgrounds_gallery');

        const grids = {
            'logos': document.getElementById('grid_logos'),
            'stickers': document.getElementById('grid_stickers'),
            'elements': document.getElementById('grid_elements'),
            'backgrounds': backgroundsGrid
        };

        // Clear and show loading state
        Object.values(grids).forEach(g => { if (g) g.innerHTML = ''; });
        if (backgroundsGallery) backgroundsGallery.innerHTML = '';

        let foundAny = false;
        Object.keys(data).forEach(cat => {
            const grid = grids[cat.toLowerCase()];
            const extraGrid = (cat.toLowerCase() === 'backgrounds') ? backgroundsGallery : null;
            const title = grid?.previousElementSibling;
            const extraTitle = extraGrid?.previousElementSibling;

            if (grid || extraGrid) {
                const assets = data[cat];
                if (assets && assets.length > 0) {
                    foundAny = true;
                    if (title) title.style.display = 'block';
                    if (grid) grid.style.display = 'grid';
                    if (extraTitle) extraTitle.style.display = 'block';
                    if (extraGrid) extraGrid.style.display = 'grid';

                    assets.forEach(asset => {
                        const createItem = (targetGrid) => {
                            const item = document.createElement('div');
                            item.className = 'asset-item';
                            const img = document.createElement('img');
                            img.src = asset.path + '?t=' + Date.now();
                            img.style.width = '100%';
                            img.style.height = '100%';
                            img.style.objectFit = 'contain';
                            img.onerror = () => {
                                item.innerHTML = '<i class="fa-solid fa-image-slash"></i>';
                            };
                            item.appendChild(img);
                            const label = document.createElement('span');
                            label.innerText = asset.name;
                            item.appendChild(label);

                            item.onclick = () => {
                                if (cat.toLowerCase() === 'backgrounds') {
                                    setCanvasBackgroundImage(asset.path);
                                } else {
                                    addImageAsset(asset.path);
                                }
                            };
                            targetGrid.appendChild(item);
                        };

                        if (grid) createItem(grid);
                        if (extraGrid) createItem(extraGrid);
                    });
                } else {
                    if (title && title.tagName === 'H4') title.style.display = 'none';
                    if (grid) grid.style.display = 'none';
                    if (extraTitle && extraTitle.tagName === 'H4') extraTitle.style.display = 'none';
                    if (extraGrid) extraGrid.style.display = 'none';
                }
            }
        });

        if (!foundAny) {
            grids.logos.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.5;">No assets found. Check /public/assets/stickers/</div>';
        }

    } catch (err) {
        console.error("[Studio] Asset discovery failed:", err);
        showToast("Asset Library: Connection Error");
    }
}

function addImageAsset(url) {
    fabric.Image.fromURL(url, function (img) {
        img.scaleToWidth(virtualFormat.w * 0.3);
        img.set({
            left: virtualFormat.w / 2,
            top: virtualFormat.h / 2,
            originX: 'center',
            originY: 'center'
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        saveHistory();
    }, { crossOrigin: 'anonymous' });
}

function setCanvasBackgroundImage(url) {
    fabric.Image.fromURL(url, (img) => {
        // Scale to cover the entire virtual area
        const scale = Math.max(virtualFormat.w / img.width, virtualFormat.h / img.height);
        img.set({
            scaleX: scale,
            scaleY: scale,
            originX: 'center',
            originY: 'center',
            left: virtualFormat.w / 2,
            top: virtualFormat.h / 2,
            selectable: false,
            evented: false,
            locked: true,
            objectCaching: false // CRITICAL: prevents background from glitching after app switching
        });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        saveHistory();
        showToast("Background applied!");
    }, { crossOrigin: 'anonymous' });
}

function addPlaceholderAsset(item) {
    const rect = new fabric.Rect({
        left: virtualFormat.w / 2 - 150,
        top: virtualFormat.h / 2 - 150,
        fill: item.color,
        width: 300,
        height: 300,
        rx: 20, ry: 20,
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 20, offsetX: 5, offsetY: 5 })
    });
    // Store metadata for identification
    rect.set('brandMetadata', item);
    canvas.add(rect);
    canvas.setActiveObject(rect);
}

let uploadedAssets = [];

// Initialize Uploaded Assets from cache storage
function initUploadedAssets() {
    try {
        const cached = localStorage.getItem('prismax_uploaded_assets');
        if (cached) {
            uploadedAssets = JSON.parse(cached);
        } else {
            uploadedAssets = [];
        }
    } catch (err) {
        console.error("Failed to load uploaded assets from localStorage cache:", err);
        uploadedAssets = [];
    }
    renderUploadedAssetsGrid();
}

// Render the grid of uploaded assets
function renderUploadedAssetsGrid() {
    const grid = document.getElementById('my_assets_grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (uploadedAssets.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: span 3; text-align: center; padding: 40px 10px; opacity: 0.4; font-size: 0.8rem; font-family: 'Montserrat', sans-serif;">
                <i class="fa-solid fa-cloud-arrow-up" style="font-size: 2rem; color: var(--primary-gold); margin-bottom: 10px; display: block;"></i>
                No custom assets yet.<br>Click "Upload" above to save images in cache!
            </div>
        `;
        return;
    }

    uploadedAssets.forEach(asset => {
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.style.backgroundImage = `url(${asset.src})`;
        item.style.backgroundSize = 'contain';
        item.style.backgroundRepeat = 'no-repeat';
        item.style.backgroundPosition = 'center';
        
        // Label for name
        const label = document.createElement('span');
        label.innerText = asset.name || 'Custom Asset';
        item.appendChild(label);

        // Delete button overlay
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-asset-btn';
        delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        delBtn.title = 'Delete asset from cache';
        delBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent adding to canvas
            deleteUploadedAsset(asset.id);
        };
        item.appendChild(delBtn);

        // Add to canvas on click
        item.onclick = (e) => {
            if (e.target.closest('.delete-asset-btn')) return;
            fabric.Image.fromURL(asset.src, (img) => {
                img.scaleToWidth(virtualFormat.w * 0.4);
                img.set({
                    left: virtualFormat.w / 2 - (img.getScaledWidth() / 2),
                    top: virtualFormat.h / 2 - (img.getScaledHeight() / 2),
                    uploadedAssetId: asset.id // Link to cache!
                });
                canvas.add(img);
                canvas.setActiveObject(img);
                saveHistory();
            }, { crossOrigin: 'anonymous' });
        };

        grid.appendChild(item);
    });
}

// Delete uploaded asset from array and update local cache
function deleteUploadedAsset(id) {
    if (!confirm("Are you sure you want to delete this custom asset from cache memory?")) return;
    uploadedAssets = uploadedAssets.filter(asset => asset.id !== id);
    try {
        localStorage.setItem('prismax_uploaded_assets', JSON.stringify(uploadedAssets));
        showToast("Asset removed from local cache. 🗑️");
    } catch (err) {
        console.error("Failed to update cache after delete:", err);
    }
    renderUploadedAssetsGrid();
}

// Reusable function to compress and upload image assets
function handleFileUpload(file) {
    if (!file) return;

    showToast("Processing & caching image asset...");

    const reader = new FileReader();
    reader.onload = function (event) {
        const imgObj = new Image();
        imgObj.onload = function () {
            // Setup canvas for resizing & compression (protect localStorage 5MB limit)
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');

            const maxDimension = 650;
            let width = imgObj.width;
            let height = imgObj.height;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            tempCanvas.width = width;
            tempCanvas.height = height;

            // Draw image on temporary canvas
            ctx.drawImage(imgObj, 0, 0, width, height);

            // Compress to JPEG with 0.8 quality or keep PNG transparent
            let compressedDataUrl;
            if (file.type === 'image/png' || file.type === 'image/svg+xml') {
                compressedDataUrl = tempCanvas.toDataURL('image/png');
            } else {
                compressedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
            }

            // Generate unique asset ID
            const assetId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const assetName = file.name.split('.')[0];

            // Save to array and local cache
            uploadedAssets.push({
                id: assetId,
                name: assetName,
                src: compressedDataUrl
            });

            try {
                localStorage.setItem('prismax_uploaded_assets', JSON.stringify(uploadedAssets));
                showToast("Asset uploaded and cached successfully! 🌟");
                
                // Also immediately load onto the canvas
                fabric.Image.fromURL(compressedDataUrl, (canvasImg) => {
                    canvasImg.scaleToWidth(virtualFormat.w * 0.4);
                    canvasImg.set({
                        left: virtualFormat.w / 2 - (canvasImg.getScaledWidth() / 2),
                        top: virtualFormat.h / 2 - (canvasImg.getScaledHeight() / 2),
                        uploadedAssetId: assetId // Link to cache!
                    });
                    canvas.add(canvasImg);
                    canvas.setActiveObject(canvasImg);
                    saveHistory();
                }, { crossOrigin: 'anonymous' });

                renderUploadedAssetsGrid();
            } catch (storageErr) {
                console.error("LocalStorage cache limit exceeded:", storageErr);
                showToast("⚠️ Local cache is full! Please delete some old uploaded assets first.");
                uploadedAssets.pop(); // remove failed entry
            }
        };
        imgObj.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Bind both sidebar and top-bar upload input listeners
document.getElementById('upload_my_asset')?.addEventListener('change', function (e) {
    handleFileUpload(e.target.files[0]);
    e.target.value = ''; // reset input
});

document.getElementById('top_upload_my_asset')?.addEventListener('change', function (e) {
    handleFileUpload(e.target.files[0]);
    e.target.value = ''; // reset input
});

function getContrastColor() {
    let bg = canvas.backgroundColor;
    if (!bg) return '#ffffff'; // Default to white for empty dark canvas
    
    // If it's a fabric.Gradient object
    if (bg && typeof bg === 'object' && bg.colorStops) {
        const firstStop = bg.colorStops[0]?.color || '#000000';
        bg = firstStop;
    }
    
    if (typeof bg !== 'string' || bg === 'transparent' || bg.includes('rgba(255,255,255,0)')) return '#ffffff';
    
    let r = 255, g = 255, b = 255;
    if (bg.startsWith('#')) {
        let hex = bg.slice(1);
        if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
        r = parseInt(hex.slice(0, 2), 16) || 0; g = parseInt(hex.slice(2, 4), 16) || 0; b = parseInt(hex.slice(4, 6), 16) || 0;
    } else if (bg.startsWith('rgb')) {
        let match = bg.match(/\d+/g);
        if (match) { r = parseInt(match[0]); g = parseInt(match[1]); b = parseInt(match[2]); }
    } else { 
        return '#ffffff'; 
    }
    return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) > 0.5 ? '#000000' : '#ffffff';
}

function addText(type = 'body', forceFont = null) {
    let textStr = 'Double tap to edit';
    let fontSize = 40;
    let fontWeight = 'normal';

    if (type === 'h1') { textStr = 'HEADING'; fontSize = 100; fontWeight = 'bold'; }
    else if (type === 'h2') { textStr = 'Subheading'; fontSize = 70; fontWeight = 'normal'; }
    else { textStr = 'Body Text'; fontSize = 40; }

    const text = new fabric.IText(textStr, {
        left: virtualFormat.w / 2,
        top: virtualFormat.h / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: forceFont || 'Caveat',
        fill: getContrastColor(),
        fontSize: fontSize,
        fontWeight: fontWeight,
        textAlign: 'center',
        editable: false
    });
    text.id = 'obj_' + Date.now();
    canvas.add(text);
    canvas.setActiveObject(text);

    // Enter editing mode and select all text automatically
    text.editable = true;
    text.enterEditing();
    text.selectAll();
    canvas.requestRenderAll();

    if (isMobile) {
        document.getElementById('right_sidebar').classList.add('sheet-open');
        document.querySelector('.nav-tab[data-target="panel_props"]').click();
    }
}

function initFonts() {
    const list = document.getElementById('font_list');
    
    // Dynamically populate the easy-access prop_fontfamily select dropdown in the properties panel
    const familySelect = document.getElementById('prop_fontfamily');
    if (familySelect) {
        familySelect.innerHTML = '';
        fontsList.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.innerText = f;
            opt.style.fontFamily = `'${f}', sans-serif`;
            familySelect.appendChild(opt);
        });
    }

    fontsList.forEach(f => {
        const div = document.createElement('div');
        div.className = 'font-item';
        div.style.fontFamily = `'${f}', sans-serif`;
        div.innerText = f;
        div.onclick = () => {
            const active = canvas.getActiveObject();
            if (active && isTextObject(active)) {
                active.set("fontFamily", f);
                canvas.requestRenderAll();
                saveHistory();
            } else {
                // If no valid text object is selected, automatically spawn a new text object with this font
                addText('body', f);
            }
        };
        list.appendChild(div);
    });

    document.getElementById('font_search_input').addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        Array.from(list.children).forEach(el => {
            el.style.display = el.innerText.toLowerCase().includes(val) ? 'block' : 'none';
        });
    });
}

function initBgPalettes() {
    const solGrid = document.getElementById('bg_solid_grid');
    PRESET_SOLID_BGS.forEach(c => {
        const div = document.createElement('div');
        div.className = 'color-item';
        div.style.backgroundColor = c;
        div.onclick = () => {
            canvas.setBackgroundColor(c, canvas.renderAll.bind(canvas));
            saveHistory();
        };
        solGrid.appendChild(div);
    });

    const gradGrid = document.getElementById('bg_grad_grid');
    PRESET_GRAD_BGS.forEach(g => {
        const div = document.createElement('div');
        div.className = 'gradient-item';
        div.style.background = g.css;
        div.onclick = () => {
            const grad = new fabric.Gradient({
                type: g.type, coords: { x1: 0, y1: 0, x2: virtualFormat.w, y2: virtualFormat.h }, colorStops: g.colorStops
            });
            canvas.setBackgroundColor(grad, canvas.renderAll.bind(canvas));
            saveHistory();
        };
        gradGrid.appendChild(div);
    });

    // Solid Color Picker
    const solidPicker = document.getElementById('bg_solid_picker');
    if (solidPicker) {
        solidPicker.addEventListener('input', (e) => {
            const color = e.target.value;
            canvas.setBackgroundColor(color, canvas.renderAll.bind(canvas));
        });
        solidPicker.addEventListener('change', () => saveHistory());
    }

    // Custom Gradient
    const btnApplyGrad = document.getElementById('btn_apply_custom_grad');
    if (btnApplyGrad) {
        btnApplyGrad.addEventListener('click', () => {
            const c1 = document.getElementById('bg_grad_start').value;
            const c2 = document.getElementById('bg_grad_end').value;
            const grad = new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: virtualFormat.w, y2: virtualFormat.h },
                colorStops: [
                    { offset: 0, color: c1 },
                    { offset: 1, color: c2 }
                ]
            });
            canvas.setBackgroundColor(grad, canvas.renderAll.bind(canvas));
            saveHistory();
            showToast("Custom Gradient Applied!");
        });
    }

    document.getElementById('bg_image_upload').addEventListener('change', (e) => {
        if (!e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                // Scale to cover
                const scale = Math.max(virtualFormat.w / img.width, virtualFormat.h / img.height);
                img.set({ scaleX: scale, scaleY: scale, originX: 'center', originY: 'center', left: virtualFormat.w / 2, top: virtualFormat.h / 2 });
                canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
                saveHistory();
            }, { crossOrigin: 'anonymous' });
        };
        reader.readAsDataURL(e.target.files[0]);
    });

    document.getElementById('btn_remove_bg').addEventListener('click', () => {
        canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
        canvas.setBackgroundColor('rgba(0,0,0,0)', canvas.renderAll.bind(canvas));
        saveHistory();
    });
}


// ============================
// PROPERTIES PANEL
// ============================
let activeCropImage = null;
let activeCropBox = null;

function updatePropsPanel() {
    window.isUpdatingPropsPanel = true;
    try {
        const active = canvas.getActiveObject();
        
        // Auto-cancellation of Crop Mode only if user clicks a non-crop canvas object
        // NOT when they click sidebar buttons (use isCropApplying guard for that)
        if (activeCropBox && !window._cropButtonClicked && (!active || active.id !== 'crop_box_temp')) {
            if (!active) {
                // Prevent accidental tap deselection in crop mode on mobile (touch inaccuracy)
                canvas.setActiveObject(activeCropBox);
                canvas.requestRenderAll();
            } else {
                // Tapped another valid object -> cancel crop mode
                cancelVisualCrop();
            }
        }
        window._cropButtonClicked = false;

        if (active && active.isFrame) {
            ensureFrameRefs(active);
        }
    const empty = document.getElementById('properties_empty');
    const editor = document.getElementById('properties_editor');

    if (!active) {
        empty.classList.remove('hidden');
        editor.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    editor.classList.remove('hidden');

    // Populate transform values
    document.getElementById('prop_x').value = Math.round(active.left);
    document.getElementById('prop_y').value = Math.round(active.top);
    document.getElementById('prop_w').value = Math.round(active.getScaledWidth());
    document.getElementById('prop_h').value = Math.round(active.getScaledHeight());
    document.getElementById('prop_angle').value = Math.round(active.angle);
    document.getElementById('prop_opacity_slider').value = Math.round((active.opacity !== undefined ? active.opacity : 1) * 100);
    document.getElementById('prop_opacity_num').value = Math.round((active.opacity !== undefined ? active.opacity : 1) * 100);

    const cornerGroup = document.getElementById('corner_properties');
    if (['rect', 'image', 'group'].includes(active.type)) {
        if (cornerGroup) cornerGroup.classList.remove('hidden');
        let rr = 0;
        if (active.type === 'rect') rr = (active.rx * active.scaleX) || 0;
        else if (active.customCornerRadius !== undefined) rr = active.customCornerRadius;
        document.getElementById('prop_corner_radius').value = Math.round(rr);
    } else {
        if (cornerGroup) cornerGroup.classList.add('hidden');
    }

    // Shadows & Effects
    if (active.shadow) {
        setPickerColor('prop_shadow_color', active.shadow.color || '#000000');
        document.getElementById('prop_shadow_blur').value = Math.round(active.shadow.blur || 0);
        document.getElementById('prop_shadow_offset_x').value = Math.round(active.shadow.offsetX || 0);
        document.getElementById('prop_shadow_offset_y').value = Math.round(active.shadow.offsetY || 0);
    } else {
        setPickerColor('prop_shadow_color', '#000000');
        document.getElementById('prop_shadow_blur').value = 10;
        document.getElementById('prop_shadow_offset_x').value = 5;
        document.getElementById('prop_shadow_offset_y').value = 5;
    }

    // Border (Stroke) Universally
    const isArrowInternalStrict = active.isArrowLine || active.isArrowHead || active.isControlPoint || active.isArrowAnchor;
    const borderGroup = document.getElementById('border_properties');
    if (!isArrowInternalStrict) {
        borderGroup.classList.remove('hidden');
        let strokeCol = active.stroke;
        let strokeW = active.strokeWidth;
        if (active.type === 'group' && active.originalShapeType) {
            const outlinePath = active.getObjects()[1];
            if (outlinePath) {
                strokeCol = outlinePath.stroke;
                strokeW = outlinePath.strokeWidth;
            }
        }
        setPickerColor('prop_border_color', strokeCol || '#000000');
        document.getElementById('prop_border_width').value = strokeW || 0;
    } else {
        borderGroup.classList.add('hidden');
    }

    // Shapes props - show fill/stroke for ALL shape types (paths, polygons, groups, lines, etc.)
    const shapeGroup = document.getElementById('shape_properties');
    const isShapeType = ['rect', 'ellipse', 'circle', 'polygon', 'triangle', 'path', 'group', 'line'].includes(active.type);
    const isArrowInternal = active.isArrowLine || active.isArrowHead || active.isControlPoint || active.isArrowAnchor;
    if (isShapeType && !isArrowInternal && !isTextObject(active) && !active.isFrame) {
        shapeGroup.classList.remove('hidden');
        let fillVal = active.fill;
        if (active.type === 'group' && active.originalShapeType) {
            const fillObj = active.getObjects()[0];
            if (fillObj) fillVal = fillObj.fill;
        }
        setPickerColor('prop_shape_fill', (typeof fillVal === 'string' ? fillVal : '#000000'));
    } else {
        shapeGroup.classList.add('hidden');
    }

    // Gradient props - visible for shapes and text
    const gradGroup = document.getElementById('gradient_properties');
    if ((isShapeType || isTextObject(active)) && !isArrowInternal && !active.isFrame) {
        gradGroup.classList.remove('hidden');
    } else {
        gradGroup.classList.add('hidden');
    }

    // Text props
    const textGroup = document.getElementById('text_properties');
    if (isTextObject(active)) {
        textGroup.classList.remove('hidden');
        document.getElementById('prop_fontsize_slider').value = active.fontSize;
        document.getElementById('prop_fontsize_num').value = active.fontSize;
        setPickerColor('prop_textcolor', active.fill || '#D4AF37');
        setPickerColor('prop_textbg', active.backgroundColor || '#000000');
        // Set Font Family dropdown value
        const fontFamilySelect = document.getElementById('prop_fontfamily');
        if (fontFamilySelect) {
            fontFamilySelect.value = active.fontFamily || 'Caveat';
        }

        document.getElementById('prop_charspacing').value = active.charSpacing;
        document.getElementById('prop_lineheight').value = active.lineHeight;

        document.getElementById('btn_text_bold').classList.toggle('active', active.fontWeight === 'bold');
        document.getElementById('btn_text_italic').classList.toggle('active', active.fontStyle === 'italic');
        document.getElementById('btn_text_underline').classList.toggle('active', active.underline);
        document.getElementById('btn_text_linethrough')?.classList.toggle('active', active.linethrough);

        document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
        if (active.textAlign) document.getElementById(`btn_align_${active.textAlign}`)?.classList.add('active');

        // Loose list checking (keeps format UI enabled even if user backspaces a single line)
        const lines = active.text.split('\n');
        const isBullet = lines.length > 0 && lines[0].startsWith('• ');
        const isNumber = lines.length > 0 && /^\d+\.\s/.test(lines[0]);
        document.getElementById('btn_list_bullet')?.classList.toggle('active', isBullet);
        document.getElementById('btn_list_number')?.classList.toggle('active', isNumber);
    } else {
        textGroup.classList.add('hidden');
    }

    // Image props
    const imageGroup = document.getElementById('image_properties');
    if (active.type === 'image') {
        if (imageGroup) imageGroup.classList.remove('hidden');
    } else {
        if (imageGroup) imageGroup.classList.add('hidden');
    }

    // Line/Arrow Props
    const arrowGroup = document.getElementById('arrow_properties');
    if (active.isArrowLine || active.isControlPoint || active.isArrowAnchor || active.isArrowHead) {
        arrowGroup.classList.remove('hidden');
        // Find the connection's persistent color
        let arrowDisplayColor = active.stroke || active.fill || '#D4AF37';
        const relConnId = active.connId || null;
        if (relConnId) {
            const relConn = connections.find(c => c.lineId === relConnId);
            if (relConn && relConn.color) arrowDisplayColor = relConn.color;
        } else if (active.isArrowAnchor) {
            const relConn = connections.find(c => c.fromId === active.id || c.toId === active.id);
            if (relConn && relConn.color) arrowDisplayColor = relConn.color;
        }
        setPickerColor('prop_arrow_color', arrowDisplayColor);
        if (active.isArrowLine) document.getElementById('prop_arrow_width').value = active.strokeWidth;
    } else {
        arrowGroup.classList.add('hidden');
    }

    // Frame Specific Properties
    const frameProperties = document.getElementById('frame_properties');
    if (active.isFrame) {
        if (frameProperties) frameProperties.classList.remove('hidden');
        if (active.outlinePath) {
            document.getElementById('prop_frame_border_toggle').checked = active.outlinePath.visible !== false;
            setPickerColor('prop_frame_border_color', active.outlinePath.stroke || '#FFFFFF');
        }
    } else {
        if (frameProperties) frameProperties.classList.add('hidden');
    }

    // Populate dedicated element entry animation properties
    const animStyleSelect = document.getElementById('prop_element_anim_style');
    const animDelayInput = document.getElementById('prop_element_anim_delay');
    if (animStyleSelect && animDelayInput) {
        animStyleSelect.value = active.customAnimStyle || 'default';
        animDelayInput.value = active.customAnimDelay !== undefined ? active.customAnimDelay : '';
    }
    } catch(e) {
        console.error("Studio Logic Error:", e);
    } finally {
        window.isUpdatingPropsPanel = false;
    }
}

function bindPropertiesPanel() {
    const bindVal = (id, prop, isNum = true, isScale = false) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            const active = canvas.getActiveObject();
            if (!active || el.value === "") return; // Fix jumping bug: don't update if input is empty

            let val = parseFloat(el.value);
            if (isNaN(val)) return;

            if (id === 'prop_opacity') val = val / 100;

            if (isScale) {
                // Handling w/h manually to update scaling
                if (id === 'prop_w') active.scaleToWidth(val);
                if (id === 'prop_h') active.scaleToHeight(val);
            } else {
                active.set(prop, val);
            }
            canvas.requestRenderAll();
        });
        el.addEventListener('change', () => saveHistory());
    };

    bindVal('prop_x', 'left');

    const applyCornerRadius = (obj, r) => {
        if (obj.type === 'rect') {
            obj.set('rx', r / obj.scaleX);
            obj.set('ry', r / obj.scaleY);
        } else if (obj.type === 'image' || obj.type === 'group') {
            obj.customCornerRadius = r;
            if (r > 0) {
                const clipPath = new fabric.Rect({
                    width: obj.width,
                    height: obj.height,
                    rx: r / obj.scaleX,
                    ry: r / obj.scaleY,
                    originX: 'center',
                    originY: 'center'
                });
                obj.set('clipPath', clipPath);
            } else {
                obj.set('clipPath', null);
            }
        }
    };

    document.getElementById('prop_corner_radius')?.addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (a) {
            applyCornerRadius(a, parseInt(e.target.value));
            canvas.requestRenderAll();
        }
    });
    document.getElementById('prop_corner_radius')?.addEventListener('change', () => saveHistory());
    bindVal('prop_y', 'top');
    bindVal('prop_w', null, true, true);
    bindVal('prop_h', null, true, true);
    bindVal('prop_angle', 'angle');

    // Opacity Sync
    ['slider', 'num'].forEach(type => {
        document.getElementById(`prop_opacity_${type}`)?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            document.getElementById('prop_opacity_slider').value = v;
            document.getElementById('prop_opacity_num').value = v;
            const a = canvas.getActiveObject();
            if (a) { a.set('opacity', v / 100); canvas.requestRenderAll(); }
        });
        document.getElementById(`prop_opacity_${type}`)?.addEventListener('change', saveHistory);
    });

    // Shadows
    const applyShadow = () => {
        const a = canvas.getActiveObject();
        if (!a) return;
        a.set('shadow', new fabric.Shadow({
            color: document.getElementById('prop_shadow_color').value,
            blur: parseFloat(document.getElementById('prop_shadow_blur').value) || 0,
            offsetX: parseFloat(document.getElementById('prop_shadow_offset_x').value) || 0,
            offsetY: parseFloat(document.getElementById('prop_shadow_offset_y').value) || 0,
        }));
        canvas.requestRenderAll();
    };
    document.getElementById('prop_shadow_color')?.addEventListener('input', applyShadow);
    document.getElementById('prop_shadow_blur')?.addEventListener('input', applyShadow);
    document.getElementById('prop_shadow_offset_x')?.addEventListener('input', applyShadow);
    document.getElementById('prop_shadow_offset_y')?.addEventListener('input', applyShadow);

    ['prop_shadow_color', 'prop_shadow_blur', 'prop_shadow_offset_x', 'prop_shadow_offset_y'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', saveHistory);
    });

    document.getElementById('btn_clear_shadow')?.addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (a) { a.set('shadow', null); canvas.requestRenderAll(); saveHistory(); }
    });

    // === 3D Shadow Presets ===
    function applyShadowPreset(color, blur, offX, offY) {
        const a = canvas.getActiveObject();
        if (!a) { showToast('Select an element first'); return; }
        a.set('shadow', new fabric.Shadow({ color: color, blur: blur, offsetX: offX, offsetY: offY }));
        // Update UI controls
        setPickerColor('prop_shadow_color', '#000000');
        document.getElementById('prop_shadow_blur').value = blur;
        document.getElementById('prop_shadow_offset_x').value = offX;
        document.getElementById('prop_shadow_offset_y').value = offY;
        canvas.requestRenderAll();
        saveHistory();
        showToast('✨ Shadow applied!');
    }

    document.getElementById('btn_shadow_soft')?.addEventListener('click', () => {
        applyShadowPreset('rgba(0,0,0,0.3)', 15, 4, 6);
    });
    document.getElementById('btn_shadow_hard')?.addEventListener('click', () => {
        applyShadowPreset('rgba(0,0,0,0.5)', 0, 6, 6);
    });
    document.getElementById('btn_shadow_3d')?.addEventListener('click', () => {
        applyShadowPreset('rgba(0,0,0,0.35)', 25, 0, 12);
    });
    document.getElementById('btn_shadow_long')?.addEventListener('click', () => {
        applyShadowPreset('rgba(0,0,0,0.25)', 3, 12, 12);
    });
    document.getElementById('btn_shadow_glow')?.addEventListener('click', () => {
        applyShadowPreset('rgba(212,175,55,0.6)', 25, 0, 0);
    });
    document.getElementById('btn_shadow_neon')?.addEventListener('click', () => {
        applyShadowPreset('rgba(0,200,255,0.7)', 30, 0, 0);
    });

    document.getElementById('btn_flip_x').addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (a) { a.set('flipX', !a.flipX); canvas.requestRenderAll(); saveHistory(); }
    });
    document.getElementById('btn_flip_y').addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (a) { a.set('flipY', !a.flipY); canvas.requestRenderAll(); saveHistory(); }
    });

    // Shape Fill and Stroke Binding
    document.getElementById('prop_shape_fill')?.addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (a) {
            if (a.type === 'group' && a.originalShapeType) {
                const fillObj = a.getObjects()[0];
                if (fillObj) fillObj.set('fill', e.target.value);
            } else {
                a.set('fill', e.target.value);
            }
            canvas.requestRenderAll();
        }
    });
    document.getElementById('prop_shape_fill')?.addEventListener('change', () => saveHistory());
    document.getElementById('btn_clear_shape_fill')?.addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (a) {
            if (a.type === 'group' && a.originalShapeType) {
                const fillObj = a.getObjects()[0];
                if (fillObj) fillObj.set('fill', 'transparent');
            } else {
                a.set('fill', 'transparent');
            }
            canvas.requestRenderAll();
            saveHistory();
        }
    });

    document.getElementById('prop_border_color')?.addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (!a) return;
        const col = e.target.value;
        
        let targetConnIds = [];
        if (a.isArrowLine || a.isArrowHead || a.isControlPoint) {
            targetConnIds.push(a.connId);
        } else if (a.isArrowAnchor) {
            connections.forEach(c => {
                if (c.fromId === a.id || c.toId === a.id) targetConnIds.push(c.lineId);
            });
        }

        if (targetConnIds.length > 0) {
            canvas.getObjects().forEach(o => {
                if (targetConnIds.includes(o.connId)) {
                    if (o.isArrowLine) o.set({ stroke: col });
                    else if (o.isArrowHead) o.set({ stroke: col, fill: col });
                    else if (o.isControlPoint) o.set({ fill: col });
                }
            });
            if (a.isArrowAnchor) a.set({ fill: col });
            // PERSIST the color on the connection object so path recreation preserves it
            targetConnIds.forEach(cid => {
                const conn = connections.find(c => c.lineId === cid);
                if (conn) conn.color = col;
            });
        } else {
            if (a.type === 'group' && a.originalShapeType) {
                const outlinePath = a.getObjects()[1];
                if (outlinePath) outlinePath.set({ stroke: col });
            } else {
                a.set({ stroke: col });
            }
            // For text, ensure stroke renders behind fill
            if (a.isType && a.isType('i-text')) {
                a.set({ paintFirst: 'stroke', strokeUniform: false });
            }
        }
        canvas.requestRenderAll();
    });
    document.getElementById('prop_border_color')?.addEventListener('change', () => saveHistory());
    
    document.getElementById('prop_border_width')?.addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (!a) return;
        const w = parseInt(e.target.value);
        if (a.type === 'group' && a.originalShapeType) {
            const outlinePath = a.getObjects()[1];
            if (outlinePath) outlinePath.set('strokeWidth', w);
        } else {
            a.set('strokeWidth', w);
        }
        // For text objects, must set paintFirst so stroke goes behind the fill
        if (a.isType && a.isType('i-text') && w > 0) {
            a.set({ paintFirst: 'stroke', strokeUniform: false });
            if (!a.stroke || a.stroke === 'transparent') {
                a.set('stroke', '#000000');
                setPickerColor('prop_border_color', '#000000');
            }
        }
        canvas.requestRenderAll();
    });
    document.getElementById('prop_border_width')?.addEventListener('change', () => saveHistory());

    document.getElementById('btn_clear_border')?.addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (a) { 
            if (a.type === 'group' && a.originalShapeType) {
                const outlinePath = a.getObjects()[1];
                if (outlinePath) outlinePath.set({ stroke: 'transparent', strokeWidth: 0 });
            } else {
                a.set({ stroke: null, strokeWidth: 0 });
            }
            document.getElementById('prop_border_width').value = 0;
            canvas.requestRenderAll(); 
            saveHistory(); 
        }
    });

    // ========== ELEMENT TRANSITION ANIMATIONS ==========
    document.getElementById('prop_element_anim_style')?.addEventListener('change', (e) => {
        const active = canvas.getActiveObject();
        if (active) {
            active.set('customAnimStyle', e.target.value);
            saveHistory();
        }
    });
    document.getElementById('prop_element_anim_delay')?.addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active) {
            const v = e.target.value;
            active.set('customAnimDelay', v !== '' ? parseFloat(v) : undefined);
        }
    });
    document.getElementById('prop_element_anim_delay')?.addEventListener('change', () => saveHistory());
    // ========== GRADIENT FILL ==========
    function updateGradientPreview() {
        const c1 = document.getElementById('grad_color1')?.value || '#D4AF37';
        const c2 = document.getElementById('grad_color2')?.value || '#ff4444';
        const dir = document.getElementById('grad_direction')?.value || 'horizontal';
        const preview = document.getElementById('gradient_preview');
        if (!preview) return;
        if (dir === 'radial') {
            preview.style.background = `radial-gradient(circle, ${c1}, ${c2})`;
        } else if (dir === 'vertical') {
            preview.style.background = `linear-gradient(to bottom, ${c1}, ${c2})`;
        } else if (dir === 'diagonal') {
            preview.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
        } else {
            preview.style.background = `linear-gradient(to right, ${c1}, ${c2})`;
        }
    }
    document.getElementById('grad_color1')?.addEventListener('input', updateGradientPreview);
    document.getElementById('grad_color2')?.addEventListener('input', updateGradientPreview);
    document.getElementById('grad_direction')?.addEventListener('change', updateGradientPreview);

    document.getElementById('btn_apply_gradient')?.addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (!a) return;
        const c1 = document.getElementById('grad_color1').value;
        const c2 = document.getElementById('grad_color2').value;
        const dir = document.getElementById('grad_direction').value;

        let gradOpts;
        if (dir === 'radial') {
            gradOpts = {
                type: 'radial',
                coords: { x1: a.width / 2, y1: a.height / 2, r1: 0, x2: a.width / 2, y2: a.height / 2, r2: Math.max(a.width, a.height) / 2 },
                colorStops: [
                    { offset: 0, color: c1 },
                    { offset: 1, color: c2 }
                ]
            };
        } else {
            let coords;
            if (dir === 'vertical') coords = { x1: 0, y1: 0, x2: 0, y2: a.height };
            else if (dir === 'diagonal') coords = { x1: 0, y1: 0, x2: a.width, y2: a.height };
            else coords = { x1: 0, y1: 0, x2: a.width, y2: 0 }; // horizontal
            gradOpts = {
                type: 'linear',
                coords: coords,
                colorStops: [
                    { offset: 0, color: c1 },
                    { offset: 1, color: c2 }
                ]
            };
        }

        a.set('fill', new fabric.Gradient(gradOpts));
        canvas.requestRenderAll();
        saveHistory();
        showToast('Gradient applied!');
    });

    document.getElementById('btn_clear_gradient')?.addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (!a) return;
        if (isTextObject(a)) {
            a.set('fill', getContrastColor());
        } else {
            a.set('fill', 'transparent');
        }
        canvas.requestRenderAll();
        saveHistory();
        showToast('Gradient cleared');
    });

    // Text Binding
    ['slider', 'num'].forEach(type => {
        document.getElementById(`prop_fontsize_${type}`).addEventListener('input', (e) => {
            const v = e.target.value;
            document.getElementById('prop_fontsize_slider').value = v;
            document.getElementById('prop_fontsize_num').value = v;
            const a = canvas.getActiveObject();
            if (a && isTextObject(a)) { a.set('fontSize', parseFloat(v)); canvas.requestRenderAll(); }
        });
        document.getElementById(`prop_fontsize_${type}`).addEventListener('change', saveHistory);
    });

    document.getElementById('prop_textcolor').addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (a && isTextObject(a)) { a.set('fill', e.target.value); canvas.requestRenderAll(); }
    });
    document.getElementById('prop_textcolor').addEventListener('change', saveHistory);

    document.getElementById('prop_textbg').addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (a && isTextObject(a)) { a.set('textBackgroundColor', e.target.value); canvas.requestRenderAll(); }
    });
    document.getElementById('btn_clear_textbg').addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (a && isTextObject(a)) { a.set('textBackgroundColor', ''); canvas.requestRenderAll(); saveHistory(); }
    });

    document.getElementById('prop_charspacing').addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (a && isTextObject(a)) { a.set('charSpacing', parseFloat(e.target.value)); canvas.requestRenderAll(); }
    });
    document.getElementById('prop_lineheight').addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (a && isTextObject(a)) { a.set('lineHeight', parseFloat(e.target.value)); canvas.requestRenderAll(); }
    });

    ['bold', 'italic', 'underline', 'linethrough'].forEach(style => {
        document.getElementById(`btn_text_${style}`)?.addEventListener('click', function () {
            const a = canvas.getActiveObject();
            if (a && isTextObject(a)) {
                if (style === 'bold') a.set('fontWeight', a.fontWeight === 'bold' ? 'normal' : 'bold');
                if (style === 'italic') a.set('fontStyle', a.fontStyle === 'italic' ? 'normal' : 'italic');
                if (style === 'underline') a.set('underline', !a.underline);
                if (style === 'linethrough') a.set('linethrough', !a.linethrough);
                this.classList.toggle('active');
                canvas.requestRenderAll();
                saveHistory();
            }
        });
    });

    ['left', 'center', 'right', 'justify'].forEach(align => {
        document.getElementById(`btn_align_${align}`)?.addEventListener('click', function () {
            const a = canvas.getActiveObject();
            if (a && isTextObject(a)) {
                a.set('textAlign', align);
                document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                canvas.requestRenderAll();
                saveHistory();
            }
        });
    });

    // List properties
    ['bullet', 'number'].forEach(listType => {
        document.getElementById(`btn_list_${listType}`)?.addEventListener('click', function () {
            const a = canvas.getActiveObject();
            if (a && isTextObject(a)) {
                let lines = a.text.split('\n');
                let isList = lines.every(l => listType === 'bullet' ? l.startsWith('• ') : /^\d+\.\s/.test(l));
                
                let newText = '';
                if (isList) {
                    newText = lines.map(l => listType === 'bullet' ? l.replace(/^•\s/, '') : l.replace(/^\d+\.\s/, '')).join('\n');
                } else {
                    newText = lines.map((l, i) => {
                        let clean = l.replace(/^•\s/, '').replace(/^\d+\.\s/, '');
                        return listType === 'bullet' ? '• ' + clean : `${i + 1}. ` + clean;
                    }).join('\n');
                }
                
                a.set('text', newText);
                canvas.requestRenderAll();
                saveHistory();
            }
        });
    });

    // Arrow bindings
    document.getElementById('prop_arrow_color')?.addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (!a) return;
        const newCol = e.target.value;

        let targets = [];
        if (a.connId) targets.push(a.connId);
        else if (a.isArrowAnchor) {
            connections.forEach(c => { if (c.fromId === a.id || c.toId === a.id) targets.push(c.lineId); });
        }

        targets.forEach(id => {
            canvas.getObjects().forEach(o => {
                if (o.connId === id) {
                    if (o.isArrowLine) o.set('stroke', newCol);
                    else if (o.isArrowHead) o.set({ stroke: newCol, fill: newCol });
                    else o.set('fill', newCol);
                }
            });
            // Sync anchor circles
            connections.forEach(c => {
                if (c.lineId === id) {
                    c.color = newCol; // PERSIST color
                    canvas.getObjects().forEach(o => {
                        if ((o.id === c.fromId || o.id === c.toId) && o.isArrowAnchor) {
                            o.set('fill', newCol);
                        }
                    });
                }
            });
        });
        canvas.requestRenderAll();
    });

    document.getElementById('prop_arrow_width')?.addEventListener('input', (e) => {
        const a = canvas.getActiveObject();
        if (!a) return;

        let targets = [];
        if (a.connId) targets.push(a.connId);
        else if (a.isArrowAnchor) {
            connections.forEach(c => { if (c.fromId === a.id || c.toId === a.id) targets.push(c.lineId); });
        }

        targets.forEach(id => {
            canvas.getObjects().forEach(o => {
                if (o.connId === id && o.isArrowLine) o.set('strokeWidth', parseInt(e.target.value));
            });
        });
        canvas.requestRenderAll();
        updateConnections(); // Recompute edges
    });

    // ========== CANVA-STYLE IMAGE FRAMES BINDINGS ==========
    document.getElementById('btn_frame_upload')?.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                fabric.Image.fromURL(event.target.result, (img) => {
                    const active = canvas.getActiveObject();
                    if (active && active.isFrame) {
                        insertImageIntoFrame(active, img, event.target.result);
                    }
                });
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    });

    document.getElementById('btn_frame_clear')?.addEventListener('click', () => {
        clearFrameImage();
    });

    document.getElementById('prop_frame_border_toggle')?.addEventListener('change', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.isFrame) {
            ensureFrameRefs(active);
            if (active.outlinePath) {
                active.outlinePath.set('visible', e.target.checked);
                canvas.requestRenderAll();
                saveHistory();
            }
        }
    });

    document.getElementById('prop_frame_border_color')?.addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.isFrame) {
            ensureFrameRefs(active);
            if (active.outlinePath) {
                active.outlinePath.set('stroke', e.target.value);
                canvas.requestRenderAll();
            }
        }
    });

    document.getElementById('prop_frame_border_color')?.addEventListener('change', () => {
        saveHistory();
    });

    // === EASY-ACCESS TEXT FONT FAMILY BINDING ===
    document.getElementById('prop_fontfamily')?.addEventListener('change', (e) => {
        const a = canvas.getActiveObject();
        if (a && isTextObject(a)) {
            a.set('fontFamily', e.target.value);
            canvas.requestRenderAll();
            saveHistory();
            showToast(`Font changed to ${e.target.value} ✨`);
        }
    });

    // === SMARTPHONE-STYLE VISUAL CROP ===
    // Uses consistent left/top origin for both image and crop box.
    // Crop box is constrained to the image's visible bounding box.
    // Math is done in the image's own local (un-rotated, un-scaled) coordinate space.

    window.startVisualCrop = function() {
        const img = canvas.getActiveObject();
        if (!img || img.type !== 'image') return;

        activeCropImage = img;

        // getBoundingRect(true, true) gives the ACTUAL top-left of the rendered image
        // in canvas coordinates, regardless of originX/originY setting.
        const imgBR = img.getBoundingRect(true, true);

        // The crop box starts exactly covering the visible image area.
        // Use originX: 'left', originY: 'top' for consistent math with getBoundingRect.
        activeCropBox = new fabric.Rect({
            left: imgBR.left,
            top: imgBR.top,
            width: imgBR.width,
            height: imgBR.height,
            angle: img.angle || 0,
            fill: 'rgba(0, 0, 0, 0.35)',
            stroke: '#FFD700',
            strokeWidth: 2,
            strokeDashArray: [8, 4],
            cornerColor: '#FFD700',
            cornerStrokeColor: '#fff',
            borderColor: '#FFD700',
            cornerSize: isMobile ? 28 : 14,
            padding: isMobile ? 8 : 0,
            transparentCorners: false,
            hasRotatingPoint: false,
            lockRotation: true,
            originX: 'left',
            originY: 'top',
            id: 'crop_box_temp',
            // Snapshot all data needed to compute the crop offset correctly
            _cropBRLeft:  imgBR.left,   // image bounding-rect top-left X at crop start
            _cropBRTop:   imgBR.top,    // image bounding-rect top-left Y at crop start
            _cropScaleX:  img.scaleX,
            _cropScaleY:  img.scaleY,
            _cropAngle:   img.angle || 0,
            _cropPrevX:   img.cropX || 0,
            _cropPrevY:   img.cropY || 0,
            _cropImgLeft: img.left,
            _cropImgTop:  img.top,
            _cropOriginX: img.originX || 'left',
            _cropOriginY: img.originY || 'top',
        });

        // Lock the original image from being moved/selected during crop
        img.set({ selectable: false, evented: false });

        canvas.add(activeCropBox);
        canvas.setActiveObject(activeCropBox);
        canvas.requestRenderAll();

        // Show sidebar active view
        document.getElementById('image_crop_default_view')?.classList.add('hidden');
        document.getElementById('image_crop_active_view')?.classList.remove('hidden');

        // Show the floating toolbar OVER the canvas
        const ft = document.getElementById('crop_floating_toolbar');
        if (ft) ft.style.display = 'flex';

        // Keyboard shortcuts: Enter = Apply, Escape = Cancel
        window._cropKeyHandler = function(e) {
            if (e.key === 'Enter') { e.preventDefault(); applyVisualCrop(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelVisualCrop(); }
        };
        window.addEventListener('keydown', window._cropKeyHandler);

        showToast('✂️ Drag handles to crop — press Enter or click Apply!');
    };

    window.applyVisualCrop = function() {
        if (!activeCropImage || !activeCropBox) return;

        // Set guard so updatePropsPanel auto-cancel does NOT fire
        window._cropButtonClicked = true;

        const img = activeCropImage;
        const box = activeCropBox;

        // Retrieve snapshotted values from when crop mode was started
        const origBRLeft = box._cropBRLeft;
        const origBRTop  = box._cropBRTop;
        const scaleX     = box._cropScaleX;
        const scaleY     = box._cropScaleY;
        const angle      = box._cropAngle;
        const prevCropX  = box._cropPrevX;
        const prevCropY  = box._cropPrevY;
        const origOriginX = box._cropOriginX;
        const origOriginY = box._cropOriginY;

        // Get true natural pixel dimensions from the HTML image element
        const nativeEl = img.getElement();
        const naturalW = nativeEl ? nativeEl.naturalWidth  : img.width;
        const naturalH = nativeEl ? nativeEl.naturalHeight : img.height;

        // Step 1: Offset of crop box top-left from image bounding rect top-left (canvas space)
        const boxLeft = box.left;
        const boxTop  = box.top;
        const dx = boxLeft - origBRLeft;
        const dy = boxTop  - origBRTop;

        // Step 2: Un-rotate to image-local axes
        const rad    = -(angle * Math.PI / 180);
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        // Step 3: Convert canvas pixels to native image pixels
        const localPxX = localX / scaleX;
        const localPxY = localY / scaleY;
        const newCropX = prevCropX + localPxX;
        const newCropY = prevCropY + localPxY;

        // Step 4: Crop size in native pixels
        const newCropW = box.getScaledWidth()  / scaleX;
        const newCropH = box.getScaledHeight() / scaleY;

        // Step 5: Clamp to natural bounds
        const finalCropX = Math.max(0, Math.min(Math.round(newCropX), naturalW - 1));
        const finalCropY = Math.max(0, Math.min(Math.round(newCropY), naturalH - 1));
        const finalW     = Math.max(1, Math.min(Math.round(newCropW), naturalW - finalCropX));
        const finalH     = Math.max(1, Math.min(Math.round(newCropH), naturalH - finalCropY));

        // Step 6: Compute new image left/top accounting for originX/Y
        let newImgLeft = boxLeft;
        let newImgTop  = boxTop;
        if (origOriginX === 'center') newImgLeft = boxLeft + (finalW * scaleX) / 2;
        else if (origOriginX === 'right') newImgLeft = boxLeft + (finalW * scaleX);
        if (origOriginY === 'center') newImgTop = boxTop + (finalH * scaleY) / 2;
        else if (origOriginY === 'bottom') newImgTop = boxTop + (finalH * scaleY);

        // Step 7: Apply
        img.set({ cropX: finalCropX, cropY: finalCropY, width: finalW, height: finalH, left: newImgLeft, top: newImgTop });
        img.setCoords();

        canvas.remove(box);
        img.set({ selectable: true, evented: true });
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        saveHistory();

        // Hide floating toolbar and reset keyboard handler
        const ft = document.getElementById('crop_floating_toolbar');
        if (ft) ft.style.display = 'none';
        if (window._cropKeyHandler) {
            window.removeEventListener('keydown', window._cropKeyHandler);
            window._cropKeyHandler = null;
        }

        document.getElementById('image_crop_default_view')?.classList.remove('hidden');
        document.getElementById('image_crop_active_view')?.classList.add('hidden');

        activeCropImage = null;
        activeCropBox   = null;

        showToast('Crop applied! ✂️');
    };

    window.cancelVisualCrop = function() {
        if (!activeCropImage || !activeCropBox) return;

        // Set guard so updatePropsPanel auto-cancel does NOT double-fire
        window._cropButtonClicked = true;

        canvas.remove(activeCropBox);
        activeCropImage.set({ selectable: true, evented: true });
        canvas.setActiveObject(activeCropImage);
        canvas.requestRenderAll();

        // Hide floating toolbar and remove keyboard handler
        const ft = document.getElementById('crop_floating_toolbar');
        if (ft) ft.style.display = 'none';
        if (window._cropKeyHandler) {
            window.removeEventListener('keydown', window._cropKeyHandler);
            window._cropKeyHandler = null;
        }

        document.getElementById('image_crop_default_view')?.classList.remove('hidden');
        document.getElementById('image_crop_active_view')?.classList.add('hidden');

        activeCropImage = null;
        activeCropBox   = null;

        showToast('Crop cancelled.');
    };

    // Bind Visual Crop buttons
    document.getElementById('btn_start_image_crop')?.addEventListener('click', () => startVisualCrop());
    document.getElementById('btn_apply_image_crop')?.addEventListener('click', () => applyVisualCrop());
    document.getElementById('btn_cancel_image_crop')?.addEventListener('click', () => cancelVisualCrop());

    document.getElementById('btn_reset_image_crop')?.addEventListener('click', () => {
        const a = canvas.getActiveObject();
        if (a && a.type === 'image') {
            const nativeEl = a.getElement();
            const originalWidth  = nativeEl ? nativeEl.naturalWidth  : (a.getOriginalSize ? a.getOriginalSize().width  : a.width);
            const originalHeight = nativeEl ? nativeEl.naturalHeight : (a.getOriginalSize ? a.getOriginalSize().height : a.height);
            a.set({ cropX: 0, cropY: 0, width: originalWidth, height: originalHeight });
            a.setCoords();
            canvas.requestRenderAll();
            saveHistory();
            showToast('Crop reset! 🌾');
        }
    });
}

// ============================
// FLOWCHART SHAPES & ARROW CONNECTION LOGIC
// ============================
function getStarPoints(outerR, innerR, numPoints) {
    let res = [];
    let angle = Math.PI / numPoints;
    for (let i = 0; i < 2 * numPoints; i++) {
        let r = (i % 2 === 0) ? outerR : innerR;
        res.push({ x: r * Math.sin(i * angle), y: -r * Math.cos(i * angle) });
    }
    return res;
}

function getHexagonPoints(r) {
    let res = [];
    for (let i = 0; i < 6; i++) {
        let angle = i * Math.PI / 3;
        res.push({ x: r * Math.sin(angle), y: -r * Math.cos(angle) });
    }
    return res;
}

function addBlock(type) {
    let shape;
    const center = { x: virtualFormat.w / 2, y: virtualFormat.h / 2 };
    const col = '#D4AF37';
    const opts = {
        left: center.x, top: center.y, originX: 'center', originY: 'center',
        fill: 'transparent', stroke: '#D4AF37', strokeWidth: 2, width: 300, height: 200,
        cornerColor: '#D4AF37', cornerSize: 10, transparentCorners: false
    };

    if (type === 'rect') shape = new fabric.Rect(opts);
    if (type === 'square') shape = new fabric.Rect({ ...opts, width: 250, height: 250 });
    if (type === 'circle') shape = new fabric.Circle({ ...opts, radius: 125 });
    if (type === 'diamond') shape = new fabric.Rect({ ...opts, width: 220, height: 220, angle: 45 });
    if (type === 'rhomboid') {
        const w = 300, h = 180, skew = 50;
        const pts = [
            { x: -w / 2 + skew, y: -h / 2 }, { x: w / 2, y: -h / 2 },
            { x: w / 2 - skew, y: h / 2 }, { x: -w / 2, y: h / 2 }
        ];
        shape = new fabric.Polygon(pts, opts);
    }
    if (type === 'clipped') {
        const w = 300, h = 200, c = 40;
        const pts = [
            { x: -w / 2 + c, y: -h / 2 }, { x: w / 2 - c, y: -h / 2 },
            { x: w / 2, y: -h / 2 + c }, { x: w / 2, y: h / 2 - c },
            { x: w / 2 - c, y: h / 2 }, { x: -w / 2 + c, y: h / 2 },
            { x: -w / 2, y: h / 2 - c }, { x: -w / 2, y: -h / 2 + c }
        ];
        shape = new fabric.Polygon(pts, opts);
    }

    shape.id = 'obj_' + Date.now();
    canvas.add(shape);
    canvas.setActiveObject(shape);

    if (isMobile) {
        document.getElementById('right_sidebar').classList.add('sheet-open');
        document.querySelectorAll('.nav-tab[data-target="panel_props"]').forEach(t => t.click());
    }
    saveHistory();
}

// ===================================
// CANVA-STYLE DEDICATED IMAGE FRAMES
// ===================================
function fitImageToFrame(img, frame) {
    const imgWidth = img.width;
    const imgHeight = img.height;
    const maskW = frame.fillShape ? (frame.fillShape.width || frame.fillShape.rx * 2 || frame.width) : frame.width;
    const maskH = frame.fillShape ? (frame.fillShape.height || frame.fillShape.ry * 2 || frame.height) : frame.height;
    const scaleX = maskW / imgWidth;
    const scaleY = maskH / imgHeight;
    const scale = Math.max(scaleX, scaleY); // Cover logic
    
    img.set({
        scaleX: scale,
        scaleY: scale,
        originX: 'center',
        originY: 'center',
        left: frame.fillShape ? frame.fillShape.left : 0,
        top: frame.fillShape ? frame.fillShape.top : 0
    });
}

function clearFrameImage() {
    const active = canvas.getActiveObject();
    if (active && active.isFrame) {
        // Find existing image
        const img = active.getObjects().find(o => o.type === 'image');
        if (img) {
            active.remove(img);
        }
        
        // Clear frameImageSrc
        active.frameImageSrc = null;
        
        // Show placeholders again
        if (active.cameraIcon) active.cameraIcon.set({ visible: true });
        if (active.placeholderText) active.placeholderText.set({ visible: true });
        if (active.fillShape) active.fillShape.set('fill', 'rgba(212, 175, 55, 0.12)');
        
        canvas.requestRenderAll();
        saveHistory();
        updatePropsPanel();
    }
}

function findFrameAtPointer(pointer) {
    const objects = canvas.getObjects();
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        if (obj.isFrame && obj.containsPoint(pointer)) {
            return obj;
        }
    }
    return null;
}

function insertImageIntoFrame(frame, img, imageSrc) {
    ensureFrameRefs(frame);
    
    // Hide placeholders and set background fill to transparent for transparent PNG support
    if (frame.cameraIcon) frame.cameraIcon.set({ visible: false });
    if (frame.placeholderText) frame.placeholderText.set({ visible: false });
    if (frame.fillShape) frame.fillShape.set('fill', 'transparent');
    
    // Remove existing image in group
    const existingImg = frame.getObjects().find(o => o.type === 'image');
    if (existingImg) {
        frame.remove(existingImg);
    }
    
    // Scale image to cover frame bounds
    fitImageToFrame(img, frame);
    
    // Set clipPath and inverse scale
    frame.clipShape.set({
        scaleX: 1 / img.scaleX,
        scaleY: 1 / img.scaleY,
        absolutePositioned: false
    });
    img.clipPath = frame.clipShape;
    
    // Add image to group without recalculating group bounds/center
    frame.add(img);
    
    // Store source base64 for history persistence!
    frame.frameImageSrc = imageSrc;
    
    // Pull sketchy border on top
    if (frame.outlinePath) {
        frame.outlinePath.bringToFront();
    }
    
    canvas.requestRenderAll();
    saveHistory();
    updatePropsPanel();
}

function ensureFrameRefs(group) {
    if (!group || !group.isFrame) return;
    
    const objects = group.getObjects();
    group.cameraIcon = objects.find(o => o.type === 'text' && o.text === '📷');
    group.placeholderText = objects.find(o => o.type === 'text' && o.text.includes('Click to Upload'));
    
    // Find outline path or rect outline
    group.outlinePath = objects.find(o => o.type === 'path');
    if (!group.outlinePath) {
        group.outlinePath = objects.find(o => o.type === 'path' || o.type === 'rect');
    }
    
    // Find fillShape
    group.fillShape = objects.find(o => 
        o !== group.cameraIcon && 
        o !== group.placeholderText && 
        o !== group.outlinePath && 
        o.type !== 'image'
    );
    
    // Recreate clipShape reference
    if (!group.clipShape) {
        const frameW = group.frameWidth || group.width;
        const frameH = group.frameHeight || group.height;
        const { clipShape } = getFrameGeometries(group.frameShapeType, frameW, frameH);
        group.clipShape = clipShape;
    }
    
    // Check if there is an image in group
    const imgObj = objects.find(o => o.type === 'image');
    if (imgObj) {
        // Hide placeholders
        if (group.cameraIcon) group.cameraIcon.set({ visible: false });
        if (group.placeholderText) group.placeholderText.set({ visible: false });
        if (group.fillShape) group.fillShape.set('fill', 'transparent');
        
        // Ensure clip path is present and inverse-scaled perfectly!
        group.clipShape.set({
            scaleX: 1 / imgObj.scaleX,
            scaleY: 1 / imgObj.scaleY,
            absolutePositioned: false
        });
        imgObj.clipPath = group.clipShape;
    } else {
        // Show placeholders
        if (group.cameraIcon) group.cameraIcon.set({ visible: true });
        if (group.placeholderText) group.placeholderText.set({ visible: true });
        if (group.fillShape) group.fillShape.set('fill', 'rgba(212, 175, 55, 0.12)');
    }
}

function addFrameToCanvas(frameType) {
    const center = { x: virtualFormat.w / 2, y: virtualFormat.h / 2 };
    let w = 280;
    let h = 280;
    if (frameType === 'rectangle') { w = 340; h = 240; }
    else if (frameType === 'long_rect') { w = 360; h = 180; }
    else if (frameType === 'oval') { w = 340; h = 220; }
    else if (frameType === 'phone') { w = 200; h = 320; }
    else if (frameType === 'laptop') { w = 340; h = 240; }
    else if (frameType === 'speech') { w = 320; h = 260; }
    else if (frameType === 'cloud') { w = 320; h = 240; }
    else if (frameType === 'moon') { w = 240; h = 280; }
    
    const col = getContrastColor();

    const cameraIcon = new fabric.Text('📷', {
        left: 0,
        top: -15,
        originX: 'center',
        originY: 'center',
        fontSize: 34,
        fill: col,
        opacity: 0.65
    });

    const placeholderText = new fabric.Text('Click to Upload\nImage', {
        left: 0,
        top: 25,
        originX: 'center',
        originY: 'center',
        fontSize: 12,
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 'bold',
        fill: col,
        opacity: 0.5,
        textAlign: 'center'
    });

    let placeholderY = 0;
    if (frameType === 'laptop') {
        placeholderY = -h * 0.1;
    }
    cameraIcon.set({ top: placeholderY - 15 });
    placeholderText.set({ top: placeholderY + 25 });

    const { fillShape, clipShape, outlinePathStr } = getFrameGeometries(frameType, w, h);
    
    // Create sketchy outline
    const outlinePath = new fabric.Path(outlinePathStr, {
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        fill: 'transparent',
        stroke: col,
        strokeWidth: 2.5,
        objectCaching: false
    });

    // Create the group
    const frameGroup = new fabric.Group([fillShape, cameraIcon, placeholderText, outlinePath], {
        left: center.x,
        top: center.y,
        originX: 'center',
        originY: 'center',
        id: 'frame_' + Date.now(),
        isFrame: true,
        frameShapeType: frameType,
        // Store original dimensions to prevent recalculation glitches on refresh!
        frameWidth: w,
        frameHeight: h,
        // References to children
        fillShape: fillShape,
        clipShape: clipShape,
        outlinePath: outlinePath,
        cameraIcon: cameraIcon,
        placeholderText: placeholderText,
        hasControls: true,
        selectable: true
    });

    canvas.add(frameGroup);
    canvas.setActiveObject(frameGroup);
    
    if (isMobile) {
        document.getElementById('right_sidebar').classList.add('sheet-open');
        document.querySelectorAll('.nav-tab[data-target="panel_props"]').forEach(t => t.click());
    }
    
    saveHistory();
    canvas.requestRenderAll();
}

function addShape(type) {
    let shape;
    const center = { x: virtualFormat.w / 2, y: virtualFormat.h / 2 };
    const col = getContrastColor();
    const opts = {
        left: center.x, top: center.y, originX: 'center', originY: 'center',
        fill: 'transparent', stroke: col, strokeWidth: 2, width: 250, height: 180, rx: 15, ry: 15
    };

    // === BASIC SHAPES ===
    if (type === 'rect') shape = new fabric.Rect(opts);
    if (type === 'rounded_rect') shape = new fabric.Rect({ ...opts, rx: 30, ry: 30 });
    if (type === 'circle') shape = new fabric.Ellipse({ ...opts, rx: 120, ry: 120 });
    if (type === 'ring') shape = new fabric.Ellipse({ ...opts, rx: 120, ry: 120, strokeWidth: 12, fill: 'transparent' });
    if (type === 'diamond') shape = new fabric.Rect({ ...opts, width: 160, height: 160, angle: 45 });
    if (type === 'triangle') shape = new fabric.Triangle({ ...opts, width: 200, height: 200, rx: 0, ry: 0 });
    if (type === 'triangle_down') shape = new fabric.Triangle({ ...opts, width: 200, height: 200, rx: 0, ry: 0, angle: 180 });
    if (type === 'triangle_right') shape = new fabric.Triangle({ ...opts, width: 200, height: 200, rx: 0, ry: 0, angle: 90 });

    // === POLYGONS ===
    if (type === 'pentagon') {
        const pts = [];
        for (let i = 0; i < 5; i++) {
            const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
            pts.push({ x: 120 * Math.cos(a), y: 120 * Math.sin(a) });
        }
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'hexagon') shape = new fabric.Polygon(getHexagonPoints(120), { ...opts, width: null, height: null, rx: 0, ry: 0 });
    if (type === 'octagon') {
        const pts = [];
        for (let i = 0; i < 8; i++) {
            const a = (i * 2 * Math.PI / 8) - Math.PI / 8;
            pts.push({ x: 120 * Math.cos(a), y: 120 * Math.sin(a) });
        }
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'star') shape = new fabric.Polygon(getStarPoints(120, 50, 5), { ...opts, width: null, height: null, rx: 0, ry: 0 });
    if (type === 'star4') shape = new fabric.Polygon(getStarPoints(120, 40, 4), { ...opts, width: null, height: null, rx: 0, ry: 0 });
    if (type === 'star6') shape = new fabric.Polygon(getStarPoints(120, 55, 6), { ...opts, width: null, height: null, rx: 0, ry: 0 });
    if (type === 'cross') {
        const s = 60, w = 200;
        const pts = [
            { x: -s, y: -w/2 }, { x: s, y: -w/2 }, { x: s, y: -s }, { x: w/2, y: -s },
            { x: w/2, y: s }, { x: s, y: s }, { x: s, y: w/2 }, { x: -s, y: w/2 },
            { x: -s, y: s }, { x: -w/2, y: s }, { x: -w/2, y: -s }, { x: -s, y: -s }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'parallelogram') {
        const w = 280, h = 160, skew = 50;
        const pts = [
            { x: -w/2 + skew, y: -h/2 }, { x: w/2, y: -h/2 },
            { x: w/2 - skew, y: h/2 }, { x: -w/2, y: h/2 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }

    // === SPECIAL SHAPES (using SVG Path) ===
    if (type === 'heart') {
        shape = new fabric.Path('M 0 -80 C -40 -130 -120 -120 -120 -60 C -120 0 -60 40 0 100 C 60 40 120 0 120 -60 C 120 -120 40 -130 0 -80 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0, fill: 'transparent', stroke: col, strokeWidth: 4
        });
    }
    if (type === 'cloud') {
        shape = new fabric.Path('M -80 20 A 50 50 0 0 1 -50 -40 A 60 60 0 0 1 50 -50 A 50 50 0 0 1 90 -10 A 40 40 0 0 1 80 40 L -60 40 A 50 50 0 0 1 -80 20 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0, scaleX: 1.3, scaleY: 1.3
        });
    }
    if (type === 'lightning') {
        const pts = [
            { x: 0, y: -100 }, { x: 40, y: -100 }, { x: 10, y: -20 }, { x: 50, y: -20 },
            { x: -10, y: 100 }, { x: 10, y: 10 }, { x: -30, y: 10 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'moon') {
        shape = new fabric.Path('M 60 -100 A 110 110 0 1 0 60 100 A 80 80 0 1 1 60 -100 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0
        });
    }
    if (type === 'speech') {
        shape = new fabric.Path('M -100 -70 L 100 -70 Q 120 -70 120 -50 L 120 30 Q 120 50 100 50 L 20 50 L -10 90 L -10 50 L -100 50 Q -120 50 -120 30 L -120 -50 Q -120 -70 -100 -70 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0
        });
    }
    if (type === 'badge') {
        shape = new fabric.Polygon(getStarPoints(120, 90, 12), { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'shield') {
        shape = new fabric.Path('M 0 -100 L 80 -60 L 80 20 C 80 70 40 100 0 120 C -40 100 -80 70 -80 20 L -80 -60 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0
        });
    }
    if (type === 'explosion') {
        shape = new fabric.Polygon(getStarPoints(130, 60, 8), { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }

    // === ARROW SHAPES (filled polygon arrows) ===
    if (type === 'arrow_right') {
        const pts = [
            { x: -120, y: -40 }, { x: 40, y: -40 }, { x: 40, y: -80 },
            { x: 120, y: 0 }, { x: 40, y: 80 }, { x: 40, y: 40 }, { x: -120, y: 40 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'arrow_left') {
        const pts = [
            { x: 120, y: -40 }, { x: -40, y: -40 }, { x: -40, y: -80 },
            { x: -120, y: 0 }, { x: -40, y: 80 }, { x: -40, y: 40 }, { x: 120, y: 40 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'arrow_up') {
        const pts = [
            { x: -40, y: 120 }, { x: -40, y: -40 }, { x: -80, y: -40 },
            { x: 0, y: -120 }, { x: 80, y: -40 }, { x: 40, y: -40 }, { x: 40, y: 120 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'arrow_down') {
        const pts = [
            { x: -40, y: -120 }, { x: -40, y: 40 }, { x: -80, y: 40 },
            { x: 0, y: 120 }, { x: 80, y: 40 }, { x: 40, y: 40 }, { x: 40, y: -120 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'chevron_right') {
        const pts = [
            { x: -80, y: -100 }, { x: 40, y: 0 }, { x: -80, y: 100 },
            { x: -40, y: 100 }, { x: 80, y: 0 }, { x: -40, y: -100 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'double_arrow') {
        const pts = [
            { x: -120, y: 0 }, { x: -60, y: -70 }, { x: -60, y: -30 }, { x: 60, y: -30 },
            { x: 60, y: -70 }, { x: 120, y: 0 }, { x: 60, y: 70 }, { x: 60, y: 30 },
            { x: -60, y: 30 }, { x: -60, y: 70 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'curved_arrow') {
        shape = new fabric.Path('M -80 60 A 100 100 0 0 1 80 -40 L 80 -80 L 120 -20 L 60 -20 L 60 -20 L 80 -20 A 80 80 0 0 0 -60 50 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0
        });
    }
    if (type === 'bend_arrow') {
        const pts = [
            { x: -100, y: 80 }, { x: -100, y: 40 }, { x: 20, y: 40 }, { x: 20, y: -40 },
            { x: -20, y: -40 }, { x: 40, y: -100 }, { x: 100, y: -40 }, { x: 60, y: -40 },
            { x: 60, y: 80 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }

    // === LINES & DIVIDERS ===
    if (type === 'line') {
        shape = new fabric.Line([-150, 0, 150, 0], {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            stroke: col, strokeWidth: 3, selectable: true
        });
    }
    if (type === 'dashed_line') {
        shape = new fabric.Line([-150, 0, 150, 0], {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            stroke: col, strokeWidth: 3, strokeDashArray: [15, 10], selectable: true
        });
    }
    if (type === 'dotted_line') {
        shape = new fabric.Line([-150, 0, 150, 0], {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            stroke: col, strokeWidth: 4, strokeDashArray: [3, 8], selectable: true
        });
    }
    if (type === 'thick_line') {
        shape = new fabric.Rect({
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            width: 350, height: 10, fill: col, stroke: '', strokeWidth: 0, rx: 5, ry: 5
        });
    }
    if (type === 'bracket_left') {
        shape = new fabric.Path('M 20 -80 Q -20 -80 -20 -40 L -20 40 Q -20 80 20 80', {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            fill: 'transparent', stroke: col, strokeWidth: 5, scaleX: 1.5, scaleY: 1.5
        });
    }
    if (type === 'bracket_right') {
        shape = new fabric.Path('M -20 -80 Q 20 -80 20 -40 L 20 40 Q 20 80 -20 80', {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            fill: 'transparent', stroke: col, strokeWidth: 5, scaleX: 1.5, scaleY: 1.5
        });
    }
    if (type === 'divider_ornate') {
        // Diamond + lines ornate divider
        const group = new fabric.Group([
            new fabric.Line([-140, 0, -20, 0], { stroke: col, strokeWidth: 2 }),
            new fabric.Rect({ left: -10, top: -10, width: 20, height: 20, angle: 45, fill: col, originX: 'center', originY: 'center' }),
            new fabric.Line([20, 0, 140, 0], { stroke: col, strokeWidth: 2 })
        ], {
            left: center.x, top: center.y, originX: 'center', originY: 'center'
        });
        shape = group;
    }
    if (type === 'wave_line') {
        shape = new fabric.Path('M -150 0 Q -110 -40 -75 0 Q -40 40 0 0 Q 40 -40 75 0 Q 110 40 150 0', {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            fill: 'transparent', stroke: col, strokeWidth: 3
        });
    }

    // === DESIGN ICONS (large text-based icons) ===
    if (type === 'checkmark') {
        shape = new fabric.Path('M -60 0 L -20 40 L 60 -40', {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            fill: 'transparent', stroke: col, strokeWidth: 10, strokeLineCap: 'round', strokeLineJoin: 'round'
        });
    }
    if (type === 'xmark') {
        const group = new fabric.Group([
            new fabric.Line([-50, -50, 50, 50], { stroke: col, strokeWidth: 8, strokeLineCap: 'round' }),
            new fabric.Line([50, -50, -50, 50], { stroke: col, strokeWidth: 8, strokeLineCap: 'round' })
        ], {
            left: center.x, top: center.y, originX: 'center', originY: 'center'
        });
        shape = group;
    }
    if (type === 'location') {
        shape = new fabric.Path('M 0 -90 C -50 -90 -80 -60 -80 -30 C -80 20 0 90 0 90 C 0 90 80 20 80 -30 C 80 -60 50 -90 0 -90 Z M 0 -10 A 25 25 0 1 1 0 -60 A 25 25 0 1 1 0 -10 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0
        });
    }
    if (type === 'bookmark') {
        const pts = [
            { x: -50, y: -80 }, { x: 50, y: -80 }, { x: 50, y: 80 },
            { x: 0, y: 40 }, { x: -50, y: 80 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0 });
    }
    if (type === 'ribbon') {
        shape = new fabric.Path('M -120 -30 L -90 -30 L -90 -50 L 90 -50 L 90 -30 L 120 -30 L 100 0 L 120 30 L 90 30 L 90 50 L -90 50 L -90 30 L -120 30 L -100 0 Z', {
            ...opts, width: null, height: null, rx: 0, ry: 0
        });
    }
    if (type === 'trophy') {
        shape = new fabric.IText('\uD83C\uDFC6', {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            fontSize: 150, fontFamily: 'sans-serif', fill: col
        });
    }
    if (type === 'crown') {
        const pts = [
            { x: -80, y: 40 }, { x: -80, y: -20 }, { x: -40, y: 10 }, { x: 0, y: -50 },
            { x: 40, y: 10 }, { x: 80, y: -20 }, { x: 80, y: 40 }
        ];
        shape = new fabric.Polygon(pts, { ...opts, width: null, height: null, rx: 0, ry: 0, scaleX: 1.5, scaleY: 1.5 });
    }
    if (type === 'fire') {
        shape = new fabric.IText('\uD83D\uDD25', {
            left: center.x, top: center.y, originX: 'center', originY: 'center',
            fontSize: 150, fontFamily: 'sans-serif', fill: col
        });
    }

    if (!shape) return;
    shape.id = 'obj_' + Date.now();
    canvas.add(shape);
    canvas.setActiveObject(shape);

    if (isMobile) {
        document.getElementById('right_sidebar').classList.add('sheet-open');
        document.querySelector('.nav-tab[data-target="panel_props"]').click();
    }
    saveHistory();
}

function addFreeArrow() {
    const center = { x: virtualFormat.w / 2, y: virtualFormat.h / 2 };
    const col = getContrastColor();

    const obj1 = new fabric.Circle({ left: center.x - 120, top: center.y, radius: 10, fill: col, originX: 'center', originY: 'center', hasBorders: false, hasControls: false });
    const obj2 = new fabric.Circle({ left: center.x + 120, top: center.y, radius: 10, fill: col, originX: 'center', originY: 'center', hasBorders: false, hasControls: false });

    obj1.id = 'obj_' + Date.now() + '_tail';
    obj2.id = 'obj_' + Date.now() + '_tip';
    obj1.set('isArrowAnchor', true);
    obj2.set('isArrowAnchor', true);

    canvas.add(obj1, obj2);
    drawConnection(obj1, obj2);

    const conn = connections[connections.length - 1];
    conn.cpOffsetX = 0;
    conn.cpOffsetY = -60;

    canvas.setActiveObject(obj2);
    updateConnections();

    if (isMobile) {
        document.getElementById('right_sidebar').classList.add('sheet-open');
        document.querySelector('.nav-tab[data-target="panel_props"]').click();
    }
}

function drawConnection(obj1, obj2) {
    const col = getContrastColor();
    const cp = new fabric.Circle({
        radius: 12, fill: col, originX: 'center', originY: 'center',
        hasBorders: false, hasControls: false, opacity: 0
    });
    const line = new fabric.Path(`M 0 0 Q 0 0 0 0`, {
        fill: '', stroke: col, strokeWidth: 3,
        selectable: true, hasControls: false, lockMovementX: true, lockMovementY: true, objectCaching: false,
        padding: 20
    });
    const head = new fabric.Path(`M -9 -12 L 9 0 L -9 12 Z`, {
        fill: col, stroke: col, strokeWidth: 3, strokeLineCap: 'round', strokeLineJoin: 'round',
        originX: 'center', originY: 'center',
        selectable: true, hasControls: false, lockMovementX: true, lockMovementY: true, objectCaching: false
    });

    const connId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    cp.set({ 'isControlPoint': true, 'connId': connId });
    line.set({ 'isArrowLine': true, 'connId': connId, 'id': connId });
    head.set({ 'isArrowHead': true, 'connId': connId });

    canvas.add(line, head, cp);
    line.sendToBack(); head.sendToBack(); cp.bringForward();

    // Calculate dynamic offset based on direction to draw a beautiful curved arrow by default
    const p1 = obj1.getCenterPoint();
    const p2 = obj2.getCenterPoint();
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    let defaultOffsetX = 0;
    let defaultOffsetY = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
        defaultOffsetY = -35; // Curve horizontal arrows slightly upward
    } else {
        defaultOffsetX = 35;  // Curve vertical arrows slightly to the right
    }

    connections.push({ fromId: obj1.id, toId: obj2.id, lineId: connId, line: line, head: head, cp: cp, cpOffsetX: defaultOffsetX, cpOffsetY: defaultOffsetY, color: col });
    updateConnections();
    saveHistory();
}

function getPerimeterPoint(obj, center, otherCenter) {
    let dx = otherCenter.x - center.x;
    let dy = otherCenter.y - center.y;
    let distance = Math.hypot(dx, dy);
    if (distance === 0) return center;
    let angle = Math.atan2(dy, dx) - (obj.angle || 0) * Math.PI / 180;

    let r = 0;
    if (obj.type === 'ellipse' || obj.type === 'circle' || obj.originalShapeType === 'circle') {
        let rx = obj.getScaledWidth() / 2;
        let ry = obj.getScaledHeight() / 2;
        let absCos = Math.abs(Math.cos(angle));
        let absSin = Math.abs(Math.sin(angle));
        r = (rx * ry) / Math.sqrt(rx * rx * absSin * absSin + ry * ry * absCos * absCos);
    } else {
        let w = obj.getScaledWidth() / 2;
        let h = obj.getScaledHeight() / 2;
        let absCos = Math.abs(Math.cos(angle));
        let absSin = Math.abs(Math.sin(angle));
        if (w * absSin > h * absCos) r = h / absSin;
        else r = w / absCos;
    }

    return {
        x: center.x + r * Math.cos(Math.atan2(dy, dx)),
        y: center.y + r * Math.sin(Math.atan2(dy, dx))
    };
}

function updateConnections() {
    // Remove broken connections first
    connections = connections.filter(c => !c._broken);
    if (connections.length === 0) return;

    const active = canvas.getActiveObject();

    connections.forEach(c => {
        let obj1 = null; let obj2 = null; let line = null; let head = null; let cp = null;
        canvas.getObjects().forEach(o => {
            if (o.id === c.fromId) obj1 = o;
            if (o.id === c.toId) obj2 = o;
            if (o.connId === c.lineId && o.isArrowLine) line = o;
            if (o.connId === c.lineId && o.isArrowHead) head = o;
            if (o.connId === c.lineId && o.isControlPoint) cp = o;
        });

        line = line || c.line; head = head || c.head; cp = cp || c.cp;

        // Clean up broken connections where source/target objects are missing
        if (!obj1 || !obj2) {
            if (line) canvas.remove(line);
            if (head) canvas.remove(head);
            if (cp) canvas.remove(cp);
            c._broken = true;
            return;
        }

        if (obj1 && obj2 && line && head && cp) {
            const p1 = obj1.getCenterPoint();
            const p2 = obj2.getCenterPoint();

            const mpX = (p1.x + p2.x) / 2;
            const mpY = (p1.y + p2.y) / 2;

            // Check if this is a top-down vertical sequential flowchart connection
            const isVerticalFlow = (p2.y > p1.y + 80) && (Math.abs(p2.x - p1.x) < 180);
            let isSpecialFlow = false;
            let startPt, endPt;

            if (isVerticalFlow && !obj1.isArrowAnchor && !obj2.isArrowAnchor) {
                // Get all shape groups sorted vertically, filtering out outer boundary frame
                const sortedShapes = canvas.getObjects().filter(o => 
                    o.type === 'group' && !o.isArrowAnchor && !o.isFrame && o.getScaledWidth() < 600
                ).sort((a, b) => a.top - b.top);
                
                const childRank = sortedShapes.indexOf(obj2);
                if (childRank !== -1) {
                    isSpecialFlow = true;
                    if (childRank % 2 === 1) {
                        // Curve left, enter left side of child
                        if (active !== cp) {
                            cp.set({ left: Math.min(p1.x, p2.x) - 180, top: (p1.y + p2.y) / 2 });
                            cp.setCoords();
                            c.cpOffsetX = cp.left - mpX;
                            c.cpOffsetY = cp.top - mpY;
                        }
                        startPt = { x: p1.x, y: p1.y + obj1.getScaledHeight() / 2 };
                        endPt = { x: p2.x - obj2.getScaledWidth() / 2, y: p2.y };
                    } else {
                        // Curve right, enter right side of child
                        if (active !== cp) {
                            cp.set({ left: Math.max(p1.x, p2.x) + 180, top: (p1.y + p2.y) / 2 });
                            cp.setCoords();
                            c.cpOffsetX = cp.left - mpX;
                            c.cpOffsetY = cp.top - mpY;
                        }
                        startPt = { x: p1.x, y: p1.y + obj1.getScaledHeight() / 2 };
                        endPt = { x: p2.x + obj2.getScaledWidth() / 2, y: p2.y };
                    }
                }
            }

            if (!isSpecialFlow) {
                if (active !== cp) {
                    cp.set({ left: mpX + (c.cpOffsetX || 0), top: mpY + (c.cpOffsetY || 0) });
                    cp.setCoords();
                } else {
                    c.cpOffsetX = cp.left - mpX;
                    c.cpOffsetY = cp.top - mpY;
                }
                startPt = obj1.isArrowAnchor ? p1 : getPerimeterPoint(obj1, p1, { x: cp.left, y: cp.top });
                endPt = obj2.isArrowAnchor ? p2 : getPerimeterPoint(obj2, p2, { x: cp.left, y: cp.top });
            }

            const dx = endPt.x - cp.left;
            const dy = endPt.y - cp.top;
            const dist = Math.hypot(dx, dy);

            if (dist > 15) {
                const sX = startPt.x;
                const sY = startPt.y;
                let eX = endPt.x - (dx / dist) * 12;
                let eY = endPt.y - (dy / dist) * 12;

                // For proper Fabric.js rendering of curved paths, we need to create a new path entirely 
                // when points change significantly, preserving properties.
                const newPathData = `M ${sX} ${sY} Q ${cp.left} ${cp.top} ${eX} ${eY}`;

                if (!line._myPath || line._myPath !== newPathData) {
                    const arrowColor = c.color || line.stroke || '#ffffff';
                    const clonedLine = new fabric.Path(newPathData, {
                        fill: '', stroke: arrowColor, strokeWidth: line.strokeWidth || 3,
                        selectable: true, evented: true, hasControls: false,
                        lockMovementX: true, lockMovementY: true,
                        isArrowLine: true, connId: line.connId, id: line.connId,
                        padding: 15, perPixelTargetFind: false,
                        objectCaching: false, hoverCursor: 'pointer'
                    });

                    canvas.insertAt(clonedLine, canvas.getObjects().indexOf(line));
                    canvas.remove(line);

                    // Update memory reference
                    c.line = clonedLine;
                    line = clonedLine;
                    line._myPath = newPathData;
                }

                line.set({ opacity: 1 });

                // Calculate angle based on bezier derivation at t=1 (the end)
                let angle = Math.atan2(eY - cp.top, eX - cp.left) * 180 / Math.PI;
                head.set({ left: eX, top: eY, angle: angle, opacity: 1, stroke: c.color || line.stroke || '#ffffff', fill: c.color || line.stroke || '#ffffff' });
            } else {
                line.set({ opacity: 0 });
                head.set({ opacity: 0 });
            }

            // Interaction States Check
            const inFocus = active === obj1 || active === obj2 || active === cp || active === line;
            if (inFocus) {
                cp.set({ opacity: 0.5 });
                cp.bringToFront();
                if (obj1.isArrowAnchor) obj1.set({ opacity: 0.8 }).bringToFront();
                if (obj2.isArrowAnchor) obj2.set({ opacity: 0.8 }).bringToFront();
            } else {
                cp.set({ opacity: 0 });
                if (obj1.isArrowAnchor) obj1.set({ opacity: 0.2 });
                if (obj2.isArrowAnchor) obj2.set({ opacity: 0.2 });
            }

            canvas.requestRenderAll();
        }
    });
}

// ============================
// HELPERS, LAYERS, SNAP, HISTORY
// ============================

let vLine, hLine;
let smartGuides = [];
const recentColors = new Set(['#D4AF37', '#8B6914', '#FFE566', '#0a0500', '#ffffff', '#000000']);

function updateRecentColorsUI() {
    const containers = document.querySelectorAll('.recent-colors-container');
    const colorArray = Array.from(recentColors).slice(-12); // keep last 12

    containers.forEach(container => {
        container.innerHTML = '';
        const targetId = container.getAttribute('data-target');
        if (!targetId) return;

        colorArray.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.title = color;
            swatch.onclick = () => {
                const input = document.getElementById(targetId);
                if (input) {
                    input.value = color;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            };
            container.appendChild(swatch);
        });
    });
}

function snapCenter(obj) {
    const threshold = 10; // px trigger distance
    const center = obj.getCenterPoint();
    const cvsCenterV = virtualFormat.w / 2;
    const cvsCenterH = virtualFormat.h / 2;

    let snapX = false, snapY = false;

    clearSnapGuides();

    // Canvas Center Snapping
    if (Math.abs(center.x - cvsCenterV) < threshold) {
        let originOffset = obj.originX === 'center' ? 0 : obj.getScaledWidth() / 2;
        obj.set({ left: cvsCenterV - originOffset });
        vLine = new fabric.Line([cvsCenterV, 0, cvsCenterV, virtualFormat.h], { stroke: '#D4AF37', strokeWidth: 2, selectable: false, evented: false, strokeDashArray: [10, 5] });
        canvas.add(vLine);
        snapX = true;
    }

    if (Math.abs(center.y - cvsCenterH) < threshold) {
        let originOffset = obj.originY === 'center' ? 0 : obj.getScaledHeight() / 2;
        obj.set('top', cvsCenterH - originOffset);
        hLine = new fabric.Line([0, cvsCenterH, virtualFormat.w, cvsCenterH], { stroke: '#D4AF37', strokeWidth: 2, selectable: false, evented: false, strokeDashArray: [10, 5] });
        canvas.add(hLine);
        snapY = true;
    }

    // Smart Snapping to other objects
    canvas.getObjects().forEach(target => {
        if (target === obj || target === vLine || target === hLine || target.isControlPoint || target.isArrowLine || target.isArrowHead || target.isArrowAnchor || target.id === 'guide') return;

        const targetCenter = target.getCenterPoint();

        if (!snapX && Math.abs(center.x - targetCenter.x) < threshold) {
            let originOffset = obj.originX === 'center' ? 0 : obj.getScaledWidth() / 2;
            obj.set({ left: targetCenter.x - originOffset });
            const line = new fabric.Line([targetCenter.x, 0, targetCenter.x, virtualFormat.h], { stroke: '#FFE566', strokeWidth: 1, selectable: false, evented: false, strokeDashArray: [5, 5], id: 'guide' });
            canvas.add(line);
            smartGuides.push(line);
            snapX = true;
        }

        if (!snapY && Math.abs(center.y - targetCenter.y) < threshold) {
            let originOffset = obj.originY === 'center' ? 0 : obj.getScaledHeight() / 2;
            obj.set({ top: targetCenter.y - originOffset });
            const line = new fabric.Line([0, targetCenter.y, virtualFormat.w, targetCenter.y], { stroke: '#FFE566', strokeWidth: 1, selectable: false, evented: false, strokeDashArray: [5, 5], id: 'guide' });
            canvas.add(line);
            smartGuides.push(line);
            snapY = true;
        }
    });
}

function clearLine(lineObj) {
    if (lineObj) canvas.remove(lineObj);
}
function clearSnapGuides() {
    clearLine(vLine); clearLine(hLine);
    vLine = null; hLine = null;
    smartGuides.forEach(g => canvas.remove(g));
    smartGuides = [];
    canvas.requestRenderAll();
}

function deleteSelected() {
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length) {
        canvas.discardActiveObject();
        activeObjects.forEach((object) => {
            // Clean up arrows attached to this object, or the arrow itself
            connections.forEach(c => {
                if (c.fromId === object.id || c.toId === object.id || c.lineId === object.id || (object.connId && c.lineId === object.connId)) {
                    canvas.getObjects().forEach(o => {
                        if (o.connId === c.lineId) canvas.remove(o);
                    });
                    c._broken = true;
                }
            });
            canvas.remove(object);
        });
        connections = connections.filter(c => !c._broken);
        saveHistory();
        updateConnections();
        updateLayersPanel();
    }
}

function duplicateSelected() {
    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;

    // Define properties to include in the clone to preserve custom properties (e.g. frames, arrow lines)
    const propertiesToInclude = [
        'id', 'selectable', 'evented', 'locked', 'objectCaching', 
        'originalShapeType', 'connId', 'isArrowLine', 'isArrowHead', 
        'isControlPoint', 'isArrowAnchor', 'customCornerRadius', 'wobbly',
        'customAnimStyle', 'customAnimDelay', 'isFrame', 'frameShapeType', 'frameImageSrc', 'frameWidth', 'frameHeight'
    ];

    activeObj.clone(function (cloned) {
        canvas.discardActiveObject();
        cloned.set({
            left: cloned.left + 50,
            top: cloned.top + 50,
            evented: true,
        });

        if (cloned.type === 'activeSelection') {
            cloned.canvas = canvas;
            cloned.forEachObject(function (obj) {
                // Generate a brand new unique ID to avoid collisions
                obj.id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                canvas.add(obj);
                
                // If this is a wobbly Canva frame, reconstruct inner structural properties and clipping paths
                if (obj.isFrame) {
                    ensureFrameRefs(obj);
                }
            });
            cloned.setCoords();
        } else {
            cloned.id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            canvas.add(cloned);
            
            // If this is a wobbly Canva frame, reconstruct inner structural properties and clipping paths
            if (cloned.isFrame) {
                ensureFrameRefs(cloned);
            }
        }

        canvas.setActiveObject(cloned);
        canvas.requestRenderAll();
        saveHistory();
    }, propertiesToInclude);
}

// Global Keyboard bindings (Ctrl+Z, Ctrl+Y, Delete, Ctrl+D, Space to Pan)
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') window.isSpaceKeyDown = true;
    if (e.ctrlKey && e.key === 'z') {
        const active = canvas.getActiveObject();
        if (active && active.isEditing) return; // Allow native textbox undo
        e.preventDefault(); undo();
    }
    if (e.ctrlKey && e.key === 'y') {
        const active = canvas.getActiveObject();
        if (active && active.isEditing) return; // Allow native textbox redo
        e.preventDefault(); redo();
    }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const t = e.target.tagName.toLowerCase();
        if (t !== 'input' && t !== 'textarea') deleteSelected();
    }
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') window.isSpaceKeyDown = false;
});

function toggleGroup() {
    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;

    if (activeObj.type === 'activeSelection') {
        activeObj.toGroup();
    } else if (activeObj.type === 'group') {
        activeObj.toActiveSelection();
    }
    canvas.requestRenderAll();
    saveHistory();
}

function mergeAllLayers() {
    canvas.discardActiveObject();
    const objs = canvas.getObjects().filter(o => o.id !== 'design_bg');
    if (objs.length <= 1) {
        showToast('Not enough elements to merge');
        return;
    }

    // Select all valid objects and merge them into a single group layer
    const sel = new fabric.ActiveSelection(objs, { canvas: canvas });
    const group = sel.toGroup();
    group.set({
        id: 'merged_' + Date.now(),
        selectable: false,
        evented: false,
        lockMovementX: true,
        lockMovementY: true,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        hasControls: false,
        hasBorders: false
    });
    
    // Clear dynamic arrow logic (they become permanent static paths within the group)
    connections = [];
    
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveHistory();
    if (typeof updateLayersPanel === 'function') updateLayersPanel();
    showToast('Progress merged successfully!');
}

function bringLayer(dir) {
    const obj = canvas.getActiveObject();
    if (!obj) return;
    if (dir === 'front') obj.bringForward();
    else if (dir === 'back') obj.sendBackwards();
    canvas.requestRenderAll();
    saveHistory();
}

// State History Helper
function isTextObject(obj) {
    return obj && (obj.type === 'i-text' || obj.type === 'textbox');
}

function saveHistory() {
    if (isHistoryAction) return;
    if (historyStack.length >= MAX_HISTORY) historyStack.shift();

    const canvasJSON = canvas.toJSON([
        'id', 'selectable', 'evented', 'locked', 'objectCaching', 
        'originalShapeType', 'connId', 'isArrowLine', 'isArrowHead', 
        'isControlPoint', 'isArrowAnchor', 'customCornerRadius', 'wobbly',
        'customAnimStyle', 'customAnimDelay', 'isFrame', 'frameShapeType', 'frameImageSrc', 'frameWidth', 'frameHeight',
        'uploadedAssetId'
    ]);

    // Strip huge Base64 strings from saved JSON states to prevent localStorage QuotaExceededError
    if (canvasJSON.objects) {
        canvasJSON.objects.forEach(obj => {
            if (obj.uploadedAssetId && obj.type === 'image') {
                obj.src = ''; // Keep canvas JSON extremely tiny and lightweight!
            }
        });
    }

    const state = {
        canvas: canvasJSON,
        connections: connections.map(c => ({
            fromId: c.fromId,
            toId: c.toId,
            lineId: c.lineId,
            color: c.color,
            cpOffsetX: c.cpOffsetX,
            cpOffsetY: c.cpOffsetY
        })),
        ratio: { w: virtualFormat.w, h: virtualFormat.h }
    };

    const stateStr = JSON.stringify(state);
    
    // Deduplication check
    if (historyStack.length > 0 && historyStack[historyStack.length - 1] === stateStr) {
        return;
    }

    historyStack.push(stateStr);
    redoStack = []; // Clear redo stack on new action

    // Persist to LocalStorage for recovery
    try {
        localStorage.setItem('prismax_design_v2', stateStr);
    } catch (storageErr) {
        console.error("[Storage] Failed to save canvas state to localStorage:", storageErr);
    }
}

function loadHistory(stateStr) {
    if (!stateStr) return;
    isHistoryAction = true;

    try {
        const state = JSON.parse(stateStr);
        if (!state) return;

        // Restore massive Base64 sources from local cache before loading canvas
        if (state.canvas && state.canvas.objects) {
            state.canvas.objects.forEach(obj => {
                if (obj.uploadedAssetId && obj.type === 'image') {
                    const cachedAsset = uploadedAssets.find(a => a.id === obj.uploadedAssetId);
                    if (cachedAsset) {
                        obj.src = cachedAsset.src;
                    }
                }
            });
        }

        if (!state.canvas) {
            // Fallback for legacy state format
            canvas.loadFromJSON(stateStr, () => {
                canvas.getObjects().forEach(o => {
                    if (o.isFrame) ensureFrameRefs(o);
                });
                resizeCanvas(false);
                isHistoryAction = false;
                updatePropsPanel();
                updateLayersPanel();
                canvas.requestRenderAll();
            });
            return;
        }

        if (state.ratio) {
            virtualFormat.w = state.ratio.w;
            virtualFormat.h = state.ratio.h;
            localStorage.setItem('prismax_ratio', JSON.stringify(virtualFormat));
        }

        canvas.loadFromJSON(state.canvas, () => {
            // ── FIX: Re-inject uploaded asset sources after canvas loads ──
            // Fabric.js creates broken <img> elements when src=="" in JSON.
            // After load, find every image with uploadedAssetId and reload its src.
            const reloadPromises = [];
            canvas.getObjects().forEach(o => {
                if (o.type === 'image' && o.uploadedAssetId) {
                    const cachedAsset = uploadedAssets.find(a => a.id === o.uploadedAssetId);
                    if (cachedAsset && cachedAsset.src) {
                        const p = new Promise(resolve => {
                            const el = new Image();
                            el.crossOrigin = 'anonymous';
                            el.onload = () => {
                                // ── CRITICAL: setElement() resets width/height to naturalWidth/naturalHeight,
                                // which undoes any crop. Snapshot and restore crop properties. ──
                                const savedCropX  = o.cropX  || 0;
                                const savedCropY  = o.cropY  || 0;
                                const savedWidth  = o.width;
                                const savedHeight = o.height;
                                const savedScaleX = o.scaleX;
                                const savedScaleY = o.scaleY;

                                o.setElement(el);

                                // Restore crop + scale exactly as they were
                                o.set({
                                    cropX:  savedCropX,
                                    cropY:  savedCropY,
                                    width:  savedWidth,
                                    height: savedHeight,
                                    scaleX: savedScaleX,
                                    scaleY: savedScaleY,
                                });
                                o.setCoords();
                                resolve();
                            };
                            el.onerror = () => resolve(); // don't block on failure
                            el.src = cachedAsset.src;
                        });
                        reloadPromises.push(p);
                    }
                }
            });

            const finalizeLoad = () => {
                // Re-bind frame references on history load
                canvas.getObjects().forEach(o => {
                    if (o.isFrame) ensureFrameRefs(o);
                });
                resizeCanvas(false);
                connections = [];
                const objects = canvas.getObjects();
                const objMap = {};
                objects.forEach(o => {
                    if (o.id) objMap[o.id] = o;
                });

                if (state.connections && Array.isArray(state.connections)) {
                    state.connections.forEach(c => {
                        const fromNode = objMap[c.fromId];
                        const toNode   = objMap[c.toId];
                        let line = null, head = null, cp = null;
                        objects.forEach(o => {
                            if (o.connId === c.lineId && o.isArrowLine) line = o;
                            if (o.connId === c.lineId && o.isArrowHead) head = o;
                            if (o.connId === c.lineId && o.isControlPoint) cp = o;
                        });
                        if (fromNode && toNode && line && head && cp) {
                            connections.push({
                                fromId: c.fromId, toId: c.toId, lineId: c.lineId,
                                line, head, cp,
                                cpOffsetX: c.cpOffsetX || 0, cpOffsetY: c.cpOffsetY || 0,
                                color: c.color
                            });
                        }
                    });
                }

                updateConnections();
                isHistoryAction = false;
                updatePropsPanel();
                updateLayersPanel();
                canvas.requestRenderAll();
            };

            if (reloadPromises.length > 0) {
                Promise.all(reloadPromises).then(finalizeLoad);
            } else {
                finalizeLoad();
            }
        });
    } catch (e) {
        console.error("Error loading history:", e);
        isHistoryAction = false;
    }
}

function undo() {
    const active = canvas.getActiveObject();
    if (active && active.isEditing) {
        active.exitEditing(); // Commits changes synchronously and triggers text:editing:exited
    }
    if (historyStack.length <= 1) return;
    redoStack.push(historyStack.pop());
    const prevState = historyStack[historyStack.length - 1];
    loadHistory(prevState);
}

function redo() {
    const active = canvas.getActiveObject();
    if (active && active.isEditing) {
        active.exitEditing();
    }
    if (redoStack.length === 0) return;
    const nextState = redoStack.pop();
    historyStack.push(nextState);
    loadHistory(nextState);
}


// ============================
// EXPORT
// ============================
// DOWNLOAD
// ============================
async function downloadCanvas(resolution = '1080p') {
    console.log("[Export] Starting High-Res Ghost Export. Resolution:", resolution);
    if (!canvas) return;

    try {
        showToast("🚀 Generating Studio Output...");

        // Calculate scaling multiplier based on target resolution
        let targetScale = 1;
        if (resolution === '1080p') {
            targetScale = 1920 / Math.max(virtualFormat.w, virtualFormat.h);
        } else if (resolution === '720p') {
            targetScale = 1280 / Math.max(virtualFormat.w, virtualFormat.h);
        }

        // 1. Snapshot JSON state
        const json = canvas.toJSON([
            'id', 'selectable', 'evented', 'locked', 'objectCaching', 
            'originalShapeType', 'connId', 'isArrowLine', 'isArrowHead', 
            'isControlPoint', 'isArrowAnchor', 'customCornerRadius', 'wobbly',
            'customAnimStyle', 'customAnimDelay', 'isFrame', 'frameShapeType', 'frameImageSrc', 'frameWidth', 'frameHeight'
        ]);

        // 2. Create a temporary 'Ghost Canvas' at scaled resolution
        const tempEl = document.createElement('canvas');
        tempEl.width = virtualFormat.w * targetScale;
        tempEl.height = virtualFormat.h * targetScale;

        const ghost = new fabric.StaticCanvas(tempEl, {
            enableRetina: false,
            backgroundColor: canvas.backgroundColor
        });

        // Apply scale zoom on static canvas to render vectors cleanly
        ghost.setZoom(targetScale);

        // 3. Load the design exactly as it is
        await new Promise(resolve => {
            ghost.loadFromJSON(json, () => {
                // Re-bind frame references and clipPaths on ghost canvas
                ghost.getObjects().forEach(o => {
                    if (o.isFrame) {
                        ensureFrameRefs(o);
                    }
                });

                // Enforce exact background color bypass json glitch
                ghost.backgroundColor = canvas.backgroundColor;
                
                // Background image fix for loadFromJSON
                if (canvas.backgroundImage) {
                    const src = canvas.backgroundImage._src || canvas.backgroundImage.src || (typeof canvas.backgroundImage.getSrc === 'function' ? canvas.backgroundImage.getSrc() : null);
                    if (src) {
                        fabric.Image.fromURL(src, (img) => {
                            if (img) {
                                const scale = Math.max((virtualFormat.w * targetScale) / img.width, (virtualFormat.h * targetScale) / img.height);
                                img.set({
                                    scaleX: scale, scaleY: scale,
                                    originX: 'center', originY: 'center',
                                    left: (virtualFormat.w * targetScale) / 2, top: (virtualFormat.h * targetScale) / 2
                                });
                                ghost.setBackgroundImage(img, () => { ghost.renderAll(); resolve(); });
                            } else {
                                ghost.renderAll(); resolve();
                            }
                        }, { crossOrigin: 'anonymous' });
                    } else {
                        ghost.renderAll(); resolve();
                    }
                } else {
                    ghost.renderAll();
                    resolve();
                }
            });
        });

        // Small delay for asset rendering
        await new Promise(r => setTimeout(r, 100));

        // 4. Generate the final 100% resolution sharp data
        const dataURL = ghost.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 1
        });

        // 5. Cleanup
        ghost.dispose();

        // 6. Trigger Download
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `prismax_content_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast("✅ Premium PNG Saved!");
    } catch (err) {
        console.error("[Export] Ghost Export Failed:", err);
        showToast("⚠️ Export Error. Try again.");
    }
}

function updateLayersPanel() {
    const list = document.getElementById('layers_list');
    if (!list) return;

    const objects = canvas.getObjects().filter(o => {
        // Filter out internal objects but KEEP the main arrow connecting line (isArrowLine) so the whole array can be deleted from layers
        return !o.isControlPoint && !o.isArrowAnchor && !o.isArrowHead && o.id !== 'guide';
    }).reverse(); // Most recent (top) first

    list.innerHTML = '';

    if (objects.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#888; font-style:italic; font-size:0.8rem;">No objects on canvas</div>';
        return;
    }

    const activeObj = canvas.getActiveObject();

    objects.forEach(obj => {
        const item = document.createElement('div');
        item.className = 'layer-item' + (activeObj === obj ? ' active' : '');

        let icon = 'fa-shapes';
        let preview = '';
        let name = 'Object';

        if (isTextObject(obj)) {
            icon = 'fa-font';
            name = obj.text.substring(0, 15) + (obj.text.length > 15 ? '...' : '');
        } else if (obj.type === 'image') {
            icon = 'fa-image';
            preview = `<img src="${obj.getSrc()}" />`;
            name = 'Image';
        } else if (obj.type === 'rect') {
            icon = 'fa-square';
            name = 'Rectangle';
        } else if (obj.type === 'circle' || obj.type === 'ellipse') {
            icon = 'fa-circle';
            name = 'Circle';
        } else if (obj.type === 'triangle') {
            icon = 'fa-caret-up';
            name = 'Triangle';
        } else if (obj.type === 'polygon') {
            icon = 'fa-draw-polygon';
            name = 'Custom Shape';
        } else if (obj.isArrowLine) {
            icon = 'fa-arrow-right-long';
            name = 'Arrow Connection';
        } else if (obj.type === 'path') {
            icon = 'fa-bezier-curve';
            name = 'Path Shape';
        } else if (obj.type === 'line') {
            icon = 'fa-minus';
            name = 'Line';
        } else if (obj.type === 'group') {
            icon = 'fa-object-group';
            name = 'Group';
        }

        item.innerHTML = `
            <div class="layer-preview">${preview || `<i class="fa-solid ${icon}"></i>`}</div>
            <div class="layer-info">
                <div class="layer-name">${name}</div>
                <div class="layer-type">${obj.type}</div>
            </div>
            <div class="layer-actions">
                <button class="layer-btn" onclick="event.stopPropagation(); moveLayer('${obj.id}', 'up')" title="Move Up"><i class="fa-solid fa-chevron-up"></i></button>
                <button class="layer-btn" onclick="event.stopPropagation(); moveLayer('${obj.id}', 'down')" title="Move Down"><i class="fa-solid fa-chevron-down"></i></button>
                <button class="layer-btn layer-delete-btn" onclick="event.stopPropagation(); deleteLayer('${obj.id}')" title="Delete Layer"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;

        item.onclick = () => {
            canvas.setActiveObject(obj);
            canvas.requestRenderAll();
        };

        list.appendChild(item);
    });
}

function moveLayer(id, dir) {
    const obj = canvas.getObjects().find(o => o.id === id);
    if (!obj) return;

    if (dir === 'up') {
        obj.bringForward();
    } else {
        obj.sendBackwards();
    }

    canvas.requestRenderAll();
    saveHistory();
    updateLayersPanel();
}

function deleteLayer(id) {
    const obj = canvas.getObjects().find(o => o.id === id);
    if (!obj) return;

    // Also clean up any connections that reference this object or the connection lines themselves
    connections.forEach(c => {
        if (c.fromId === id || c.toId === id || c.lineId === id || (obj.connId && c.lineId === obj.connId)) {
            // Remove all associated arrow parts from canvas
            canvas.getObjects().forEach(o => {
                if (o.connId === c.lineId) canvas.remove(o);
            });
            c._broken = true;
        }
    });
    connections = connections.filter(c => !c._broken);

    canvas.remove(obj);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveHistory();
    updateLayersPanel();
}

async function performAssetSearch(query) {
    if (!query || query.trim().length < 2) return;

    const source = document.getElementById('asset_search_source').value;
    const grid = document.getElementById('grid_search_results');

    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--primary-gold);"><i class="fa-solid fa-spinner fa-spin"></i> Searching ${source}...</div>';

    try {
        let items = [];

        if (source === 'pixabay') {
            const PIXABAY_KEY = '49265961-d70cb9e403d64380993049da0';
            const response = await fetch(`https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=30`);
            const data = await response.json();
            if (data.hits) {
                items = data.hits.map(hit => ({ preview: hit.previewURL, full: hit.largeImageURL }));
            }
        }
        else if (source === 'openverse') {
            const response = await fetch(`https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&page_size=30`);
            const data = await response.json();
            if (data.results) {
                items = data.results.map(img => ({ preview: img.thumbnail, full: img.url }));
            }
        }
        else if (source === 'icons') {
            const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=50`);
            const data = await response.json();
            if (data.icons) {
                items = data.icons.map(icon => {
                    const [prefix, name] = icon.split(':');
                    return {
                        preview: `https://api.iconify.design/${prefix}/${name}.svg`,
                        full: `https://api.iconify.design/${prefix}/${name}.svg`
                    };
                });
            }
        }

        grid.innerHTML = '';
        if (items.length > 0) {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'asset-item';
                div.innerHTML = `<img src="${item.preview}" style="width:100%; height:100%; object-fit:contain;">`;
                div.onclick = () => addImageAsset(item.full);
                grid.appendChild(div);
            });
        } else {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; opacity:0.5;">No results found on ${source}.</div>`;
        }

    } catch (err) {
        console.error("Search Error:", err);
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#ff4444;">Search failed. Please try another source or check your connection.</div>';
    }
}

function clearAssetSearch() {
    document.getElementById('grid_search_results').innerHTML = '<div style="text-align:center; padding:40px; opacity:0.3; font-size:0.8rem;">Enter keywords to find thousands of assets</div>';
    document.getElementById('asset_search_input').value = '';
}

// =========================================================================
// AI ASSISTANT & LOCAL TOOLS INTEGRATION (BACKGROUND REMOVAL, INFOGRAPHICS)
// =========================================================================


let imglyBgRemovalModule = null;
async function getImglyBgRemoval() {
    if (imglyBgRemovalModule) return imglyBgRemovalModule;
    showToast("Initializing local AI background remover... 🧠");
    try {
        imglyBgRemovalModule = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm');
        return imglyBgRemovalModule;
    } catch (err) {
        console.error("Failed to load @imgly/background-removal:", err);
        showToast("Failed to load local AI model. Check your connection!");
        throw err;
    }
}

async function performBackgroundRemoval() {
    const active = canvas.getActiveObject();
    if (!active || active.type !== 'image') {
        showToast("Please select an image first!");
        return;
    }
    
    const modal = document.getElementById('ai_loading_modal');
    const title = document.getElementById('ai_loading_title');
    const subtitle = document.getElementById('ai_loading_subtitle');
    const progressContainer = document.getElementById('ai_progress_container');
    const progressBar = document.getElementById('ai_progress_bar');
    const progressText = document.getElementById('ai_progress_text');
    
    // Show beautiful loading overlay
    title.innerText = "Removing Background...";
    subtitle.innerText = "Processing image completely locally in your browser using neural networks. Please wait... 🔮";
    
    // Enable progress display for the first download
    progressContainer.classList.remove('hidden');
    progressText.classList.remove('hidden');
    progressBar.style.width = "0%";
    progressText.innerText = "0% complete";
    modal.classList.remove('hidden');
    
    try {
        const imgly = await getImglyBgRemoval();
        let src = active.getSrc();
        
        console.log("[AI Background Removal] Processing image source:", src);
        
        const resultBlob = await imgly.removeBackground(src, {
            progress: (key, current, total) => {
                const pct = Math.round((current / total) * 100);
                progressBar.style.width = `${pct}%`;
                if (key === 'fetch') {
                    subtitle.innerText = `Downloading local AI neural models (~40MB, cached subsequently)...`;
                    progressText.innerText = `Downloading: ${pct}%`;
                } else {
                    subtitle.innerText = `Segmenting image foreground and removing background...`;
                    progressText.innerText = `AI Processing: ${pct}%`;
                }
            }
        });
        
        const reader = new FileReader();
        reader.onloadend = function() {
            const base64data = reader.result;
            
            // Snapshot crop/scale properties before updating image source
            const originalCropX = active.cropX || 0;
            const originalCropY = active.cropY || 0;
            const originalWidth = active.width;
            const originalHeight = active.height;
            
            // If the image is an uploaded custom asset, update its cached representation in localStorage so history re-injects the clean version
            if (active.uploadedAssetId) {
                const assetIndex = uploadedAssets.findIndex(a => a.id === active.uploadedAssetId);
                if (assetIndex !== -1) {
                    uploadedAssets[assetIndex].src = base64data;
                    try {
                        localStorage.setItem('prismax_uploaded_assets', JSON.stringify(uploadedAssets));
                        renderUploadedAssetsGrid();
                    } catch (storeErr) {
                        console.error("[Storage] Failed to update uploaded asset with background-removed version:", storeErr);
                    }
                }
            }

            active.setSrc(base64data, () => {
                // Restore snapshotted crop/scale properties
                active.set({
                    cropX: originalCropX,
                    cropY: originalCropY,
                    width: originalWidth,
                    height: originalHeight
                });
                
                canvas.renderAll();
                saveHistory();
                updatePropsPanel();
                modal.classList.add('hidden');
                showToast("Background removed successfully! ✨");
            }, { crossOrigin: 'anonymous' });
        };
        reader.readAsDataURL(resultBlob);
        
    } catch (err) {
        console.error("AI Background Removal Error:", err);
        showToast("AI background removal failed.");
        modal.classList.add('hidden');
    }
}

function initAIControls() {
    // Bind Generate button
    document.getElementById('btn_generate_infographic')?.addEventListener('click', generateInfographicFlowchart);
    
    // Bind Background Removal button
    document.getElementById('btn_ai_remove_bg')?.addEventListener('click', performBackgroundRemoval);

    // Bind AI Modal Controls
    const aiModal = document.getElementById('ai_modal');
    const closeAiBtn = document.getElementById('close_ai_modal');
    if (closeAiBtn) {
        closeAiBtn.onclick = closeAIModal;
    }
    if (aiModal) {
        aiModal.onclick = (e) => {
            if (e.target === aiModal) closeAIModal();
        };
    }

    // Bind Quick Suggestion Tags
    window.setAiPrompt = function(promptText) {
        const promptTextarea = document.getElementById('ai_prompt');
        if (promptTextarea) {
            promptTextarea.value = promptText;
            showToast("✨ Suggestion loaded!");
        }
    };
}

async function generateInfographicFlowchart() {
    const promptText = document.getElementById('ai_prompt').value.trim();
    const styleTheme = document.getElementById('ai_style').value;
    const layoutFlow = document.getElementById('ai_layout').value;
    const templateType = document.getElementById('ai_template_type').value;
    
    if (!promptText) {
        showToast("Please enter an infographic concept or topic description!");
        return;
    }
    
    const modal = document.getElementById('ai_loading_modal');
    const title = document.getElementById('ai_loading_title');
    const subtitle = document.getElementById('ai_loading_subtitle');
    const progressContainer = document.getElementById('ai_progress_container');
    const progressText = document.getElementById('ai_progress_text');
    
    title.innerText = "AI is designing...";
    subtitle.innerText = `Consulting secure high-powered Llama 3.3 AI model to structure your layout... 🔮`;
    progressContainer.classList.add('hidden');
    progressText.classList.add('hidden');
    modal.classList.remove('hidden');
    
    try {
        const response = await fetch("/api/ai/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: promptText,
                styleTheme: styleTheme,
                layoutFlow: layoutFlow,
                templateType: templateType
            })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `HTTP Error ${response.status}`);
        }
        
        const data = await response.json();
        const jsonContent = JSON.parse(data.choices[0].message.content);
        
        console.log("[AI Flowchart Generator] Parsed structured flowchart data:", jsonContent);
        modal.classList.add('hidden');
        closeAIModal();
        setTimeout(async () => {
            await renderInfographic(jsonContent);
            showToast("Infographic generated successfully! ✨");
        }, 50);
        
    } catch (err) {
        console.error("AI Infographic Generation Error:", err);
        showToast("AI Infographic generation failed. Please check your connection or try again!");
        modal.classList.add('hidden');
    }
}

// Excalidraw-style sketchy path generator helpers
function getSketchyPolygonPath(points) {
    if (!points || points.length < 2) return '';
    let path = '';
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        path += getSketchyLinePath(p1.x, p1.y, p2.x, p2.y) + ' ';
    }
    return path.trim();
}

function getHeartPoints(w, h) {
    const points = [];
    const steps = 40;
    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
        points.push({ x: x * (w / 34), y: y * (h / 34) });
    }
    return points;
}

function getCloudPoints(w, h) {
    const pts = [];
    const steps = 60;
    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const r = 1 + 0.15 * Math.sin(6 * angle);
        const x = Math.cos(angle) * (w / 2) * r;
        const y = Math.sin(angle) * (h / 2) * r + h*0.05;
        pts.push({ x, y });
    }
    return pts;
}

function getShieldPoints(w, h) {
    const pts = [];
    pts.push({ x: -w/2, y: -h/2 + h*0.1 });
    pts.push({ x: -w/4, y: -h/2 + h*0.03 });
    pts.push({ x: 0, y: -h/2 });
    pts.push({ x: w/4, y: -h/2 + h*0.03 });
    pts.push({ x: w/2, y: -h/2 + h*0.1 });
    pts.push({ x: w/2, y: h*0.1 });
    for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const x = (w/2) * (1 - t*t);
        const y = h*0.1 + (h/2 - h*0.1) * t;
        pts.push({ x, y });
    }
    for (let i = 9; i >= 0; i--) {
        const t = i / 10;
        const x = -(w/2) * (1 - t*t);
        const y = h*0.1 + (h/2 - h*0.1) * t;
        pts.push({ x, y });
    }
    pts.push({ x: -w/2, y: h*0.1 });
    return pts;
}

function getSpeechBubblePoints(w, h) {
    const pts = [];
    const r = 20;
    const x1 = -w/2, y1 = -h/2 + 15, x2 = w/2, y2 = h/2 - 25;
    pts.push({ x: x1 + r, y: y1 });
    pts.push({ x: x2 - r, y: y1 });
    pts.push({ x: x2, y: y1 + r });
    pts.push({ x: x2, y: y2 - r });
    pts.push({ x: x2 - r, y: y2 });
    pts.push({ x: w*0.1, y: y2 });
    pts.push({ x: -w*0.05, y: y2 + 25 });
    pts.push({ x: 0, y: y2 });
    pts.push({ x: x1 + r, y: y2 });
    pts.push({ x: x1, y: y2 - r });
    pts.push({ x: x1, y: y1 + r });
    return pts;
}

function getSketchyLaptopPath(w, h) {
    const screenW = w * 0.9;
    const screenH = h * 0.7;
    const screenY = -h * 0.1;
    let path = getSketchyRectPath(screenW, screenH, 8);
    path = path.replace(/(?:M|L|Q|C)\s*(-?\d+\.?\d*)\s*(-?\d+\.?\d*)/g, (match, px, py) => {
        const cmd = match[0];
        const newY = parseFloat(py) + screenY;
        return `${cmd} ${px} ${newY}`;
    });

    path += ' ' + getSketchyLinePath(-w/2, h*0.3, w/2, h*0.3);
    path += ' ' + getSketchyLinePath(-w/2, h*0.3, -w*0.45, h*0.4);
    path += ' ' + getSketchyLinePath(-w*0.45, h*0.4, w*0.45, h*0.4);
    path += ' ' + getSketchyLinePath(w*0.45, h*0.4, w/2, h*0.3);
    
    let trackpad = getSketchyRectPath(w*0.15, h*0.06, 2);
    trackpad = trackpad.replace(/(?:M|L|Q|C)\s*(-?\d+\.?\d*)\s*(-?\d+\.?\d*)/g, (match, px, py) => {
        const cmd = match[0];
        const newY = parseFloat(py) + (h * 0.35);
        return `${cmd} ${px} ${newY}`;
    });
    path += ' ' + trackpad;
    return path;
}

function getSketchyPhonePath(w, h) {
    const phoneW = w * 0.65;
    const phoneH = h * 0.95;
    let path = getSketchyRectPath(phoneW, phoneH, 18);
    
    let webcam = getSketchyEllipsePath(phoneW * 0.08, phoneW * 0.08);
    webcam = webcam.replace(/(?:M|L|Q|C)\s*(-?\d+\.?\d*)\s*(-?\d+\.?\d*)/g, (match, px, py) => {
        const cmd = match[0];
        const newY = parseFloat(py) - (phoneH/2 - 20);
        return `${cmd} ${px} ${newY}`;
    });
    path += ' ' + webcam;

    let home = getSketchyEllipsePath(phoneW * 0.12, phoneW * 0.12);
    home = home.replace(/(?:M|L|Q|C)\s*(-?\d+\.?\d*)\s*(-?\d+\.?\d*)/g, (match, px, py) => {
        const cmd = match[0];
        const newY = parseFloat(py) + (phoneH/2 - 20);
        return `${cmd} ${px} ${newY}`;
    });
    path += ' ' + home;
    return path;
}

function getOctagonPoints(w, h) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
        const a = (i * 2 * Math.PI / 8) - Math.PI / 8;
        pts.push({ x: (w/2) * Math.cos(a), y: (h/2) * Math.sin(a) });
    }
    return pts;
}

// Function to generate geometries for Canva-Style Image Frames
function getFrameGeometries(type, w, h) {
    let fillShape;
    let clipShape;
    let outlinePathStr = '';
    
    const fillOpts = {
        left: 0, top: 0, originX: 'center', originY: 'center',
        fill: 'rgba(212, 175, 55, 0.12)', stroke: 'transparent', strokeWidth: 0
    };
    
    if (type === 'circle') {
        fillShape = new fabric.Ellipse({ ...fillOpts, rx: w/2, ry: h/2 });
        clipShape = new fabric.Ellipse({ ...fillOpts, rx: w/2, ry: h/2 });
        outlinePathStr = getSketchyEllipsePath(w, h);
    }
    else if (type === 'rectangle') {
        fillShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 0, ry: 0 });
        clipShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 0, ry: 0 });
        outlinePathStr = getSketchyRectPath(w, h, 0);
    }
    else if (type === 'long_rect') {
        fillShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 0, ry: 0 });
        clipShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 0, ry: 0 });
        outlinePathStr = getSketchyRectPath(w, h, 0);
    }
    else if (type === 'square') {
        fillShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 0, ry: 0 });
        clipShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 0, ry: 0 });
        outlinePathStr = getSketchyRectPath(w, h, 0);
    }
    else if (type === 'oval') {
        fillShape = new fabric.Ellipse({ ...fillOpts, rx: w/2, ry: h/2 });
        clipShape = new fabric.Ellipse({ ...fillOpts, rx: w/2, ry: h/2 });
        outlinePathStr = getSketchyEllipsePath(w, h);
    }
    else if (type === 'flower') {
        const pts = getFlowerPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'rounded_rect') {
        fillShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 20, ry: 20 });
        clipShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 20, ry: 20 });
        outlinePathStr = getSketchyRectPath(w, h, 20);
    }
    else if (type === 'diamond') {
        const pts = [{ x: 0, y: -h/2 }, { x: w/2, y: 0 }, { x: 0, y: h/2 }, { x: -w/2, y: 0 }];
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyDiamondPath(w, h);
    }
    else if (type === 'triangle') {
        const pts = [{ x: 0, y: -h/2 }, { x: w/2, y: h/2 }, { x: -w/2, y: h/2 }];
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'hexagon') {
        const pts = getHexagonPoints(w/2);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'octagon') {
        const pts = getOctagonPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'star') {
        const pts = getStarPoints(w/2, w/4, 5);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'heart') {
        const pts = getHeartPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'cloud') {
        const pts = getCloudPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'shield') {
        const pts = getShieldPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'speech') {
        const pts = getSpeechBubblePoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'badge') {
        const pts = getBadgePoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'moon') {
        const pts = getMoonPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'explosion') {
        const pts = getExplosionPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'pentagon') {
        const pts = getPentagonPoints(w, h);
        fillShape = new fabric.Polygon(pts, fillOpts);
        clipShape = new fabric.Polygon(pts, fillOpts);
        outlinePathStr = getSketchyPolygonPath(pts);
    }
    else if (type === 'laptop') {
        const screenW = w * 0.9;
        const screenH = h * 0.7;
        const screenY = -h * 0.1;
        fillShape = new fabric.Rect({ ...fillOpts, left: 0, top: screenY, width: screenW, height: screenH, rx: 6, ry: 6 });
        clipShape = new fabric.Rect({ ...fillOpts, left: 0, top: screenY, width: screenW, height: screenH, rx: 6, ry: 6 });
        outlinePathStr = getSketchyLaptopPath(w, h);
    }
    else if (type === 'phone') {
        const phoneW = w * 0.65;
        const phoneH = h * 0.95;
        const screenW = phoneW * 0.9;
        const screenH = phoneH * 0.85;
        fillShape = new fabric.Rect({ ...fillOpts, left: 0, top: 0, width: screenW, height: screenH, rx: 12, ry: 12 });
        clipShape = new fabric.Rect({ ...fillOpts, left: 0, top: 0, width: screenW, height: screenH, rx: 12, ry: 12 });
        outlinePathStr = getSketchyPhonePath(w, h);
    }
    else {
        fillShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 15, ry: 15 });
        clipShape = new fabric.Rect({ ...fillOpts, width: w, height: h, rx: 15, ry: 15 });
        outlinePathStr = getSketchyRectPath(w, h, 15);
    }

    return { fillShape, clipShape, outlinePathStr };
}

function getFlowerPoints(w, h) {
    const pts = [];
    const steps = 80;
    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const r = 0.72 + 0.28 * Math.cos(5 * t); // 5 beautiful flower petals!
        const x = Math.cos(t) * (w / 2) * r;
        const y = Math.sin(t) * (h / 2) * r;
        pts.push({ x, y });
    }
    return pts;
}

function getBadgePoints(w, h) {
    const pts = [];
    const steps = 32;
    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const r = (i % 2 === 0) ? 0.5 : 0.42;
        pts.push({ x: Math.cos(angle) * w * r, y: Math.sin(angle) * h * r });
    }
    return pts;
}

function getMoonPoints(w, h) {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
        const a = -Math.PI/2 + (i/20) * Math.PI;
        pts.push({ x: (w/2) * Math.cos(a), y: (h/2) * Math.sin(a) });
    }
    for (let i = 20; i >= 0; i--) {
        const a = -Math.PI/2 + (i/20) * Math.PI;
        pts.push({ x: (w/2) * Math.cos(a) * 0.4 + w*0.15, y: (h/2) * Math.sin(a) });
    }
    return pts;
}

function getExplosionPoints(w, h) {
    const pts = [];
    const steps = 16;
    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const r = (i % 2 === 0) ? 0.5 : 0.28;
        pts.push({ x: Math.cos(angle) * w * r, y: Math.sin(angle) * h * r });
    }
    return pts;
}

function getPentagonPoints(w, h) {
    const pts = [];
    for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
        pts.push({ x: (w/2) * Math.cos(a), y: (h/2) * Math.sin(a) });
    }
    return pts;
}

function getSketchyLinePath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    if (distance < 5) return `M ${x1} ${y1} L ${x2} ${y2}`;
    
    const offset = Math.min(3.5, distance * 0.025);
    
    // Pass 1
    const p1_cp1x = x1 + dx * 0.33 + (Math.random() - 0.5) * offset;
    const p1_cp1y = y1 + dy * 0.33 + (Math.random() - 0.5) * offset;
    const p1_cp2x = x1 + dx * 0.66 + (Math.random() - 0.5) * offset;
    const p1_cp2y = y1 + dy * 0.66 + (Math.random() - 0.5) * offset;
    const p1_endx = x2 + (Math.random() - 0.5) * (offset * 0.4);
    const p1_endy = y2 + (Math.random() - 0.5) * (offset * 0.4);
    
    // Pass 2
    const p2_cp1x = x1 + dx * 0.33 + (Math.random() - 0.5) * offset;
    const p2_cp1y = y1 + dy * 0.33 + (Math.random() - 0.5) * offset;
    const p2_cp2x = x1 + dx * 0.66 + (Math.random() - 0.5) * offset;
    const p2_cp2y = y1 + dy * 0.66 + (Math.random() - 0.5) * offset;
    const p2_endx = x2 + (Math.random() - 0.5) * (offset * 0.4);
    const p2_endy = y2 + (Math.random() - 0.5) * (offset * 0.4);
    
    return `M ${x1} ${y1} C ${p1_cp1x} ${p1_cp1y}, ${p1_cp2x} ${p1_cp2y}, ${p1_endx} ${p1_endy} ` +
           `M ${x1 + (Math.random() - 0.5) * 1.5} ${y1 + (Math.random() - 0.5) * 1.5} C ${p2_cp1x} ${p2_cp1y}, ${p2_cp2x} ${p2_cp2y}, ${p2_endx} ${p2_endy}`;
}

function getSketchyRectPath(w, h, rx = 0) {
    const x1 = -w/2;
    const y1 = -h/2;
    const x2 = w/2;
    const y2 = h/2;
    
    if (rx > 0) {
        let path = '';
        for (let pass = 0; pass < 2; pass++) {
            const r = rx;
            const off = () => (Math.random() - 0.5) * 2;
            path += `M ${x1 + r + off()} ${y1 + off()} ` +
                    `L ${x2 - r + off()} ${y1 + off()} ` +
                    `Q ${x2 + off()} ${y1 + off()}, ${x2 + off()} ${y1 + r + off()} ` +
                    `L ${x2 + off()} ${y2 - r + off()} ` +
                    `Q ${x2 + off()} ${y2 + off()}, ${x2 - r + off()} ${y2 + off()} ` +
                    `L ${x1 + r + off()} ${y2 + off()} ` +
                    `Q ${x1 + off()} ${y2 + off()}, ${x1 + off()} ${y2 - r + off()} ` +
                    `L ${x1 + off()} ${y1 + r + off()} ` +
                    `Q ${x1 + off()} ${y1 + off()}, ${x1 + r + off()} ${y1 + off()} `;
        }
        return path;
    }
    
    return `${getSketchyLinePath(x1, y1, x2, y1)} ` +
           `${getSketchyLinePath(x2, y1, x2, y2)} ` +
           `${getSketchyLinePath(x2, y2, x1, y2)} ` +
           `${getSketchyLinePath(x1, y2, x1, y1)}`;
}

function getSketchyEllipsePath(w, h) {
    const rx = w / 2;
    const ry = h / 2;
    const kappa = 0.5522847498;
    
    function getPass(offsetFactor) {
        const offX = () => (Math.random() - 0.5) * offsetFactor;
        const offY = () => (Math.random() - 0.5) * offsetFactor;
        
        const rx_o = rx + offX();
        const ry_o = ry + offY();
        const cx1 = rx_o * kappa;
        const cy1 = ry_o * kappa;
        
        return `M ${rx_o} 0 ` +
               `C ${rx_o} ${cy1 + offY()}, ${cx1 + offX()} ${ry_o}, 0 ${ry_o} ` +
               `C ${-cx1 + offX()} ${ry_o}, ${-rx_o} ${cy1 + offY()}, ${-rx_o} 0 ` +
               `C ${-rx_o} ${-cy1 + offY()}, ${-cx1 + offX()} ${-ry_o}, 0 ${-ry_o} ` +
               `C ${cx1 + offX()} ${-ry_o}, ${rx_o} ${-cy1 + offY()}, ${rx_o} 0`;
    }
    
    const scale = Math.min(6, w * 0.04);
    return getPass(scale) + " " + getPass(scale);
}

function getSketchyDiamondPath(w, h) {
    const p1x = 0, p1y = -h/2;
    const p2x = w/2, p2y = 0;
    const p3x = 0, p3y = h/2;
    const p4x = -w/2, p4y = 0;
    
    return `${getSketchyLinePath(p1x, p1y, p2x, p2y)} ` +
           `${getSketchyLinePath(p2x, p2y, p3x, p3y)} ` +
           `${getSketchyLinePath(p3x, p3y, p4x, p4y)} ` +
           `${getSketchyLinePath(p4x, p4y, p1x, p1y)}`;
}

async function renderInfographic(data) {
    if (!data) return;
    if (canvas.getObjects().length > 0) {
        if (!confirm("⚠️ Generating a new design will CLEAR all your current work.\n\nAre you sure you want to continue?")) return;
    }
    
    isHistoryAction = true;
    canvas.clear();
    resizeCanvas(false);
    connections = [];
    
    // 1. Apply Background
    if (data.canvas && data.canvas.background) {
        const bg = data.canvas.background;
        if (typeof bg === 'string') {
            canvas.setBackgroundColor(bg, canvas.renderAll.bind(canvas));
        } else if (bg.type === 'gradient') {
            let coords = { x1: 0, y1: 0, x2: 0, y2: virtualFormat.h };
            if (bg.direction === 'horizontal') coords = { x1: 0, y1: 0, x2: virtualFormat.w, y2: 0 };
            else if (bg.direction === 'diagonal') coords = { x1: 0, y1: 0, x2: virtualFormat.w, y2: virtualFormat.h };
            
            const grad = new fabric.Gradient({
                type: 'linear',
                coords: coords,
                colorStops: [
                    { offset: 0, color: bg.start },
                    { offset: 1, color: bg.end }
                ]
            });
            canvas.setBackgroundColor(grad, canvas.renderAll.bind(canvas));
        }
    } else {
        canvas.setBackgroundColor('#0a0500', canvas.renderAll.bind(canvas));
    }
    
    const scaleFactorX = virtualFormat.w / 1080;
    const scaleFactorY = virtualFormat.h / 1080;
    const nodeMap = {};
    const promises = [];
    
    // 2. Render Elements
    const elementsList = data.elements || data.nodes || [];
    
    const hasShapes = elementsList.some(el => el.type === 'shape');
    const hasConnections = data.connections && data.connections.length > 0;
    const isFlowchart = hasShapes && hasConnections;
    
    elementsList.forEach(el => {
        const left = (el.x || 540) * scaleFactorX;
        const top = (el.y || 540) * scaleFactorY;
        const width = (el.width || 200) * scaleFactorX;
        const height = (el.height || 120) * scaleFactorY;
        
        if (el.type === 'text') {
            if (isFlowchart) return;
            const textObj = new fabric.IText(el.text || '', {
                left: left,
                top: top,
                originX: 'center',
                originY: 'center',
                fontFamily: el.fontFamily || 'Caveat',
                fontSize: (el.fontSize || 32) * scaleFactorX,
                fontWeight: el.fontWeight || 'normal',
                fill: el.textColor || '#ffffff',
                textAlign: 'center',
                width: width,
                editable: false
            });
            textObj.id = el.id || ('text_' + Date.now() + Math.random());
            canvas.add(textObj);
            nodeMap[textObj.id] = textObj;
            
        } else if (el.type === 'image') {
            const imgPromise = new Promise((resolve) => {
                fabric.Image.fromURL(el.src, (img) => {
                    img.set({
                        left: left,
                        top: top,
                        originX: 'center',
                        originY: 'center',
                        id: el.id || ('img_' + Date.now() + Math.random())
                    });
                    if (el.width) img.scaleToWidth(el.width * scaleFactorX);
                    else img.scaleToWidth(200 * scaleFactorX);
                    canvas.add(img);
                    nodeMap[img.id] = img;
                    resolve();
                }, { crossOrigin: 'anonymous' });
            });
            promises.push(imgPromise);
            
        } else if (el.type === 'shape' || !el.type) {
            const shapeType = el.shapeType || el.type || 'rect';
            
            // 1. Draw solid background shape (with transparent border) at its absolute coordinates
            let fillShape;
            const fillOpts = {
                left: left,
                top: top,
                originX: 'center',
                originY: 'center',
                fill: el.fill || 'rgba(212,175,55,0.06)',
                stroke: 'transparent',
                strokeWidth: 0,
                width: width,
                height: height
            };
            
            if (shapeType === 'circle') {
                const rx = Math.min(width, height) / 2;
                fillShape = new fabric.Ellipse({
                    ...fillOpts,
                    rx: rx,
                    ry: rx
                });
            } else if (shapeType === 'diamond') {
                const w = width, h = height;
                const pts = [
                    { x: 0, y: -h/2 },
                    { x: w/2, y: 0 },
                    { x: 0, y: h/2 },
                    { x: -w/2, y: 0 }
                ];
                fillShape = new fabric.Polygon(pts, fillOpts);
            } else if (shapeType === 'rounded_rect') {
                fillShape = new fabric.Rect({
                    ...fillOpts,
                    rx: 20 * scaleFactorX,
                    ry: 20 * scaleFactorX
                });
            } else { // rect
                fillShape = new fabric.Rect({
                    ...fillOpts,
                    rx: 4 * scaleFactorX,
                    ry: 4 * scaleFactorX
                });
            }
            
            // 2. Generate sketchy outline paths at their absolute coordinates
            let sketchyPathStr = '';
            if (shapeType === 'circle') {
                sketchyPathStr = getSketchyEllipsePath(width, height);
            } else if (shapeType === 'diamond') {
                sketchyPathStr = getSketchyDiamondPath(width, height);
            } else if (shapeType === 'rounded_rect') {
                sketchyPathStr = getSketchyRectPath(width, height, 20 * scaleFactorX);
            } else { // rect
                sketchyPathStr = getSketchyRectPath(width, height, 0);
            }
            
            const shapeGroupMembers = [fillShape];
            if (el.stroke !== 'transparent' && el.strokeWidth !== 0) {
                const outlinePath = new fabric.Path(sketchyPathStr, {
                    left: left,
                    top: top,
                    originX: 'center',
                    originY: 'center',
                    fill: 'transparent',
                    stroke: el.stroke || '#D4AF37',
                    strokeWidth: el.strokeWidth || 2.5,
                    objectCaching: false
                });
                shapeGroupMembers.push(outlinePath);
            }
            
            // 3. Combine fill and sketchy outline in a Fabric Group centered at left/top
            const shapeGroup = new fabric.Group(shapeGroupMembers, {
                left: left,
                top: top,
                originX: 'center',
                originY: 'center',
                id: el.id || ('shape_' + Date.now() + Math.random()),
                selectable: true,
                hasControls: true,
                shadow: new fabric.Shadow({
                    color: 'rgba(0, 0, 0, 0.45)',
                    blur: 15 * scaleFactorX,
                    offsetX: 6 * scaleFactorX,
                    offsetY: 8 * scaleFactorX
                })
            });
            
            // Add custom property for getPerimeterPoint
            shapeGroup.originalShapeType = shapeType;
            
            canvas.add(shapeGroup);
            nodeMap[shapeGroup.id] = shapeGroup;
            
            // If the element has a text title inside it (legacy node format support)
            if (el.title) {
                const showDesc = el.description && !isFlowchart;
                const titleText = new fabric.Textbox(el.title, {
                    left: left,
                    top: top - (showDesc ? 18 : 0) * scaleFactorY,
                    originX: 'center',
                    originY: 'center',
                    fontFamily: el.fontFamily || 'Caveat',
                    fontSize: 26 * scaleFactorX,
                    fontWeight: 'bold',
                    fill: el.textColor || '#ffffff',
                    textAlign: 'center',
                    width: width - 20,
                    splitByGrapheme: false,
                    editable: false
                });
                titleText.id = 'text_' + Date.now() + '_' + Math.random();
                canvas.add(titleText);
                
                if (showDesc) {
                    const descText = new fabric.Textbox(el.description, {
                        left: left,
                        top: top + 22 * scaleFactorY,
                        originX: 'center',
                        originY: 'center',
                        fontFamily: el.fontFamily || 'Caveat',
                        fontSize: 16 * scaleFactorX,
                        fill: el.textColor || '#cccccc',
                        textAlign: 'center',
                        width: width - 20,
                        opacity: 0.8,
                        splitByGrapheme: false,
                        editable: false
                    });
                    descText.id = 'text_' + Date.now() + '_' + Math.random();
                    canvas.add(descText);
                }
            }
        }
    });
    
    // 3. Render Connections after all images are loaded
    await Promise.all(promises);
    
    if (data.connections && Array.isArray(data.connections)) {
        const hasShapes = elementsList.some(el => el.type === 'shape');
        const hasConnections = data.connections && data.connections.length > 0;
        const isFlowchart = hasShapes && hasConnections;
        
        // Render smart arrows
        data.connections.forEach(conn => {
            const fromNode = nodeMap[conn.from];
            const toNode = nodeMap[conn.to];
            if (fromNode && toNode) {
                drawConnection(fromNode, toNode);
                
                if (conn.label && !isFlowchart) {
                    const midX = (fromNode.left + toNode.left) / 2;
                    const midY = (fromNode.top + toNode.top) / 2;
                    
                    const labelColor = getContrastColor();
                    
                    const labelObj = new fabric.IText(conn.label, {
                        left: midX,
                        top: midY,
                        originX: 'center',
                        originY: 'center',
                        fontFamily: 'Kalam',
                        fontSize: 16 * scaleFactorX,
                        fontWeight: 'bold',
                        fill: labelColor,
                        stroke: labelColor === '#ffffff' ? '#000000' : '#ffffff',
                        strokeWidth: 2 * scaleFactorX,
                        paintFirst: 'stroke',
                        backgroundColor: 'transparent',
                        textAlign: 'center'
                    });
                    labelObj.id = 'text_' + Date.now() + '_' + Math.random();
                    canvas.add(labelObj);
                    labelObj.bringToFront();
                }
            }
        });
    }
    
    isHistoryAction = false;
    saveHistory();
    updateLayersPanel();
    canvas.requestRenderAll();
}

// 5-Second Cinematic Presentation Animation
function playIntroAnimation() {
    if (!canvas) return;
    showToast("🎬 Playing Cinematic Preview...");

    const objects = canvas.getObjects().filter(o => o.id !== 'guide');
    if (objects.length === 0) return;

    // Discard active selection to prevent visual quirks
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    // 1. Snapshot all original object states
    const originalStates = new Map();
    objects.forEach(o => {
        originalStates.set(o, {
            left: o.left,
            top: o.top,
            opacity: o.opacity !== undefined ? o.opacity : 1,
            scaleX: o.scaleX !== undefined ? o.scaleX : 1,
            scaleY: o.scaleY !== undefined ? o.scaleY : 1,
            angle: o.angle || 0
        });
    });

    // 2. Set initial animation starting states
    objects.forEach(o => {
        const orig = originalStates.get(o);
        const animStyle = o.customAnimStyle || 'default';
        
        let startLeft = orig.left;
        let startTop = orig.top;
        let startScaleX = orig.scaleX;
        let startScaleY = orig.scaleY;
        let startOpacity = 0;
        let startAngle = orig.angle;

        if (animStyle === 'none') {
            startOpacity = orig.opacity;
        } else if (animStyle === 'fade') {
            startOpacity = 0;
        } else if (animStyle === 'slide_down') {
            startTop = orig.top - 40;
        } else if (animStyle === 'slide_up') {
            startTop = orig.top + 40;
        } else if (animStyle === 'slide_left') {
            startLeft = orig.left - 40;
        } else if (animStyle === 'slide_right') {
            startLeft = orig.left + 40;
        } else if (animStyle === 'zoom') {
            startScaleX = 0;
            startScaleY = 0;
        } else if (animStyle === 'rotate') {
            startAngle = orig.angle - 45;
            startOpacity = 0;
        } else {
            // 'default' style (smart auto)
            if (isTextObject(o)) {
                startTop = orig.top - 40;
            } else if (o.type === 'group') {
                startScaleX = 0;
                startScaleY = 0;
            } else if (o.type === 'image') {
                startTop = orig.top + 30;
            } else if (o.isArrowLine || o.isArrowHead || o.isControlPoint) {
                startOpacity = 0;
            }
        }

        o.set({
            left: startLeft,
            top: startTop,
            scaleX: startScaleX,
            scaleY: startScaleY,
            angle: startAngle,
            opacity: startOpacity
        });
        o.setCoords();
    });
    canvas.requestRenderAll();

    // 3. Trigger staggered entry animations
    objects.forEach(o => {
        const orig = originalStates.get(o);
        
        // Stagger delay based on vertical height or custom setting
        let delay;
        if (o.customAnimDelay !== undefined && o.customAnimDelay >= 0) {
            delay = o.customAnimDelay * 1000;
        } else {
            delay = Math.min(1800, Math.max(0, (o.top / virtualFormat.h) * 1400));
        }

        setTimeout(() => {
            // Animate opacity to original
            o.animate('opacity', orig.opacity, {
                duration: 900,
                onChange: canvas.renderAll.bind(canvas),
                easing: fabric.util.ease.easeOutQuad
            });

            // Animate position to original
            if (o.top !== orig.top) {
                o.animate('top', orig.top, {
                    duration: 1000,
                    onChange: canvas.renderAll.bind(canvas),
                    easing: fabric.util.ease.easeOutBack
                });
            }
            if (o.left !== orig.left) {
                o.animate('left', orig.left, {
                    duration: 1000,
                    onChange: canvas.renderAll.bind(canvas),
                    easing: fabric.util.ease.easeOutBack
                });
            }

            // Animate scale to original (spring physics bounce)
            if (o.scaleX !== orig.scaleX) {
                o.animate('scaleX', orig.scaleX, {
                    duration: 1000,
                    onChange: canvas.renderAll.bind(canvas),
                    easing: fabric.util.ease.easeOutBack
                });
            }
            if (o.scaleY !== orig.scaleY) {
                o.animate('scaleY', orig.scaleY, {
                    duration: 1000,
                    onChange: canvas.renderAll.bind(canvas),
                    easing: fabric.util.ease.easeOutBack
                });
            }
            
            // Animate angle back to original
            if (o.angle !== orig.angle) {
                o.animate('angle', orig.angle, {
                    duration: 1000,
                    onChange: canvas.renderAll.bind(canvas),
                    easing: fabric.util.ease.easeOutBack
                });
            }

        }, delay);
    });

    // 4. Synchronously redraw arrows during transitions to create a wobbly draw effect
    let animTimer = 0;
    const interval = setInterval(() => {
        updateConnections();
        canvas.requestRenderAll();
        animTimer += 16;
        if (animTimer >= 3200) {
            clearInterval(interval);
            // Ensure absolute precision lock on final values
            objects.forEach(o => {
                const orig = originalStates.get(o);
                o.set({
                    left: orig.left,
                    top: orig.top,
                    opacity: orig.opacity,
                    scaleX: orig.scaleX,
                    scaleY: orig.scaleY,
                    angle: orig.angle
                });
                o.setCoords();
            });
            updateConnections();
            canvas.requestRenderAll();
        }
    }, 16);
}

// Cinematic Video Capture Engine
async function recordCinematicVideo(resolution = '1080p') {
    const modal = document.getElementById('export_modal');
    if (modal) modal.classList.add('hidden');

    const loader = document.getElementById('ai_loading_modal');
    const title = document.getElementById('ai_loading_title');
    const subtitle = document.getElementById('ai_loading_subtitle');
    const progressContainer = document.getElementById('ai_progress_container');
    const progressText = document.getElementById('ai_progress_text');

    title.innerText = "📽️ Recording Cinematic Video...";
    subtitle.innerText = "Capturing custom wiggles and staggered spring reveals live at 30 FPS. Please wait... 🎬";
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressText) progressText.classList.add('hidden');
    if (loader) loader.classList.remove('hidden');

    // 1. Play the entry animation transition sequence!
    playIntroAnimation();

    // 2. Capture canvas stream in real-time
    const canvasEl = document.getElementById('c');
    const stream = canvasEl.captureStream(30); // 30 FPS capture
    
    // WebM is universally supported by modern browser MediaRecorder API
    const options = { mimeType: 'video/webm;codecs=vp9' };
    let recorder;
    try {
        recorder = new MediaRecorder(stream, options);
    } catch (e) {
        recorder = new MediaRecorder(stream);
    }

    const chunks = [];
    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            chunks.push(e.data);
        }
    };

    recorder.onstop = () => {
        // Build video blob
        const blob = new Blob(chunks, { type: recorder.mimeType });
        
        // Trigger download naming it .mp4 (WebM codecs play natively as MP4 in modern players)
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prismax_presentation_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        if (loader) loader.classList.add('hidden');
        showToast("✅ Cinematic Video Saved!");
    };

    // 3. Start recording!
    recorder.start();

    // 4. Record for 4.5 seconds (captures entire wiggle reveal)
    setTimeout(() => {
        recorder.stop();
    }, 4500);
}

// ==========================================
// PREMIUM CUSTOM DATA-DRIVEN TEMPLATES ENGINE
// ==========================================

const CUSTOM_TEMPLATES = [
    {
        id: 'startup_showcase',
        name: 'Startup Pitch Slide',
        desc: 'Slate blue slide featuring a central sketchy laptop frame and staggered text reveals.',
        category: 'Slides', emoji: '💻', thumbBg: 'linear-gradient(135deg, #1e293b, #0f172a)',
        w: 900, h: 600, bgColor: '#0F172A',
        elements: [
            { type: 'text', text: 'PROJECT AETHER', x: 450, y: 85, s: 48, w: 600, f: '#D4AF37', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'text', text: 'Next-Generation AI Design & Cinematic Presentation Suite', x: 450, y: 140, s: 15, w: 600, f: '#94A3B8', st: 'fade', d: 0.3 },
            { type: 'frame', shape: 'laptop', x: 450, y: 345, w: 380, h: 250, src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80' },
            { type: 'shape', shape: 'rounded_rect', x: 160, y: 220, w: 120, h: 40, fill: '#1E293B', stroke: '#D4AF37', st: 'zoom', d: 0.3 },
            { type: 'text', text: 'RELEASE V2.0', x: 160, y: 220, s: 11, w: 100, f: '#D4AF37', weight: 'bold' },
            { type: 'text', text: '⚡ Proportional Vector Scaling', x: 170, y: 310, s: 14, w: 220, f: '#E2E8F0', align: 'left', st: 'slide_right', d: 0.4 },
            { type: 'text', text: '🌀 Staggered Spring Physics', x: 170, y: 370, s: 14, w: 220, f: '#E2E8F0', align: 'left', st: 'slide_right', d: 0.6 },
            { type: 'text', text: '📷 Canvas Mask Snapping', x: 170, y: 430, s: 14, w: 220, f: '#E2E8F0', align: 'left', st: 'slide_right', d: 0.8 }
        ]
    },
    {
        id: 'spring_promo',
        name: 'Spring Product Promo',
        desc: 'Vibrant pastel pink-purple-orange banner with wobbly circular frame and floral accents.',
        category: 'Marketing', emoji: '🌸', thumbBg: 'linear-gradient(135deg, #ff9a9e, #fecfef)',
        w: 800, h: 800, bgColor: '#FFF1F2',
        elements: [
            { type: 'shape', shape: 'rect', x: 400, y: 400, w: 740, h: 740, fill: '#FFF5F5', stroke: '#E11D48', strokeWidth: 2 },
            { type: 'frame', shape: 'circle', x: 240, y: 420, w: 320, h: 320, src: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'SPRING', x: 580, y: 230, s: 60, w: 300, f: '#E11D48', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'text', text: 'COLLECTION', x: 580, y: 295, s: 28, w: 300, f: '#BE123C', st: 'fade', d: 0.4, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 580, y: 390, w: 180, h: 50, fill: '#FDE047', stroke: '#E11D48', st: 'zoom', d: 0.5 },
            { type: 'text', text: '50% OFF TODAY', x: 580, y: 390, s: 13, w: 160, f: '#9F1239', weight: 'bold' },
            { type: 'text', text: 'Vibrant organic aesthetics, hand-sketched layouts.', x: 580, y: 490, s: 12, w: 220, f: '#4C0519', st: 'fade', d: 0.7 }
        ]
    },
    {
        id: 'business_flowchart',
        name: 'Blockchain Architecture Flow',
        desc: 'Vibrant wobbly blocks connected by custom curves, with perfect Kalam handwritten fonts and wobbly open arrowheads.',
        category: 'Infographics', emoji: '🔗', thumbBg: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
        w: 900, h: 1200, bgColor: '#0B0F19',
        elements: [
            // Nodes (Blocks and Texts)
            // Node 1 (Coral pink)
            { type: 'shape', shape: 'rect', x: 260, y: 150, w: 260, h: 130, fill: '#FF8D9C', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.1 },
            { type: 'text', text: 'Blockchain Growth\nAI • DeFi • Gaming •\nSocial', x: 260, y: 150, s: 17, w: 240, f: '#000000', fontFamily: 'Kalam', weight: 'bold' },

            // Node 2 (Brown/Rust)
            { type: 'shape', shape: 'rect', x: 640, y: 150, w: 260, h: 130, fill: '#B45309', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.2 },
            { type: 'text', text: 'More Users\nMore Transactions\nMore Data', x: 640, y: 150, s: 17, w: 240, f: '#ffffff', fontFamily: 'Kalam', weight: 'bold' },

            // Node 3 (Magenta)
            { type: 'shape', shape: 'rect', x: 450, y: 310, w: 260, h: 130, fill: '#EC4899', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.3 },
            { type: 'text', text: 'Hidden Bottleneck\nData Propagation\nBetween Nodes', x: 450, y: 310, s: 17, w: 240, f: '#000000', fontFamily: 'Kalam', weight: 'bold' },

            // Node 4 (Sky Blue)
            { type: 'shape', shape: 'rect', x: 450, y: 480, w: 300, h: 140, fill: '#0284C7', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.4 },
            { type: 'text', text: 'Optimum RLNC Layer\nSmarter Data\nDistribution', x: 450, y: 480, s: 18, w: 280, f: '#000000', fontFamily: 'Kalam', weight: 'bold' },

            // Node 5 (Green)
            { type: 'shape', shape: 'rect', x: 200, y: 650, w: 200, h: 80, fill: '#15803D', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.5 },
            { type: 'text', text: '150ms Propagation', x: 200, y: 650, s: 16, w: 180, f: '#000000', fontFamily: 'Kalam', weight: 'bold' },

            // Node 6 (Soft purple/pink)
            { type: 'shape', shape: 'rect', x: 450, y: 650, w: 200, h: 80, fill: '#E879F9', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.6 },
            { type: 'text', text: 'Less Bandwidth', x: 450, y: 650, s: 16, w: 180, f: '#000000', fontFamily: 'Kalam', weight: 'bold' },

            // Node 7 (Teal)
            { type: 'shape', shape: 'rect', x: 700, y: 650, w: 200, h: 80, fill: '#0F766E', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.7 },
            { type: 'text', text: 'Faster Node\nCommunication', x: 700, y: 650, s: 16, w: 180, f: '#000000', fontFamily: 'Kalam', weight: 'bold' },

            // Node 8 (Deep bronze)
            { type: 'shape', shape: 'rect', x: 450, y: 830, w: 300, h: 150, fill: '#78350F', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.8 },
            { type: 'text', text: 'Stronger Network\nPerformance\nEfficient • Responsive •\nScalable', x: 450, y: 830, s: 17, w: 280, f: '#ffffff', fontFamily: 'Kalam', weight: 'bold' },

            // Node 9 (Pale blue)
            { type: 'shape', shape: 'rect', x: 450, y: 1030, w: 300, h: 150, fill: '#E0F2FE', stroke: '#ffffff', strokeWidth: 2.5, st: 'zoom', d: 0.9 },
            { type: 'text', text: 'Better Blockchain\nInfrastructure\nWithout Changing\nConsensus', x: 450, y: 1030, s: 17, w: 280, f: '#0B0F19', fontFamily: 'Kalam', weight: 'bold' },

            // Credits text
            { type: 'text', text: 'By - Orihimay', x: 780, y: 1150, s: 20, w: 200, f: '#ffffff', fontFamily: 'Kalam', st: 'fade', d: 1.0 }
        ],
        connections: [
            { from: 0, to: 2, color: '#ffffff' },
            { from: 2, to: 4, color: '#ffffff' },
            { from: 4, to: 6, color: '#ffffff' },
            { from: 6, to: 8, color: '#ffffff' },
            { from: 6, to: 10, color: '#ffffff' },
            { from: 6, to: 12, color: '#ffffff' },
            { from: 8, to: 14, color: '#ffffff' },
            { from: 10, to: 14, color: '#ffffff' },
            { from: 12, to: 14, color: '#ffffff' },
            { from: 14, to: 16, color: '#ffffff' }
        ]
    },
    {
        id: 'cyberpunk_poster',
        name: 'Cyberpunk Neo Poster',
        desc: 'Neon dark purple/magenta art, wobbly hexagon frame, cyan text, and cybernetic stickers.',
        category: 'Art & Posters', emoji: '🔮', thumbBg: 'linear-gradient(135deg, #3b0764, #120024)',
        w: 800, h: 1000, bgColor: '#0B001A',
        elements: [
            { type: 'shape', shape: 'rect', x: 400, y: 500, w: 740, h: 940, fill: 'transparent', stroke: '#EC4899', strokeWidth: 2.5 },
            { type: 'frame', shape: 'hexagon', x: 400, y: 440, w: 350, h: 350, src: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'NEO-HUMAN', x: 400, y: 140, s: 56, w: 600, f: '#06B6D4', st: 'rotate', d: 0.1, weight: 'bold' },
            { type: 'text', text: 'FUTURE PROTOCOL // 2.09', x: 400, y: 205, s: 14, w: 600, f: '#F43F5E', st: 'fade', d: 0.3 },
            { type: 'text', text: 'ESTABLISHED 2026 // RETRO-FUTURE', x: 400, y: 700, s: 12, w: 600, f: '#E2E8F0', st: 'fade', d: 0.5 },
            { type: 'shape', shape: 'rounded_rect', x: 400, y: 830, w: 500, h: 110, fill: '#1E1B4B', stroke: '#EC4899', st: 'zoom', d: 0.6 },
            { type: 'text', text: 'We design digital realities, merging biological consciousness with infinite vector-scaled cyber engines.', x: 400, y: 830, s: 12, w: 440, f: '#F3F4F6' }
        ]
    },
    {
        id: 'mobile_presentation',
        name: 'Mobile App Showcase',
        desc: 'Slate dark theme, sketchy mobile phone frame in the center, bulleted feature labels.',
        category: 'Slides', emoji: '📱', thumbBg: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
        w: 900, h: 600, bgColor: '#09090B',
        elements: [
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 300, w: 840, h: 520, fill: '#18181B', stroke: '#D4AF37', strokeWidth: 1.5, rx: 12, ry: 12 },
            { type: 'frame', shape: 'phone', x: 250, y: 300, w: 220, h: 350, src: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'STUDIO MOBILE', x: 600, y: 140, s: 38, w: 340, f: '#D4AF37', align: 'left', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'text', text: 'Take vector design wherever you wander.', x: 600, y: 195, s: 14, w: 340, f: '#A1A1AA', align: 'left' },
            { type: 'text', text: '⚡ Live Physics Presentations', x: 600, y: 270, s: 13, w: 340, f: '#F4F4F5', align: 'left', st: 'slide_right', d: 0.4 },
            { type: 'text', text: '🎨 Proportional Crop Snapping', x: 600, y: 325, s: 13, w: 340, f: '#F4F4F5', align: 'left', st: 'slide_right', d: 0.6 },
            { type: 'text', text: '🔒 Offline Local History', x: 600, y: 380, s: 13, w: 340, f: '#F4F4F5', align: 'left', st: 'slide_right', d: 0.8 },
            { type: 'shape', shape: 'rect', x: 600, y: 465, w: 180, h: 45, fill: '#D4AF37', stroke: 'transparent', st: 'zoom', d: 0.9 },
            { type: 'text', text: 'GET ACCESS', x: 600, y: 465, s: 11, w: 160, f: '#09090B', weight: 'bold' }
        ]
    },
    {
        id: 'resume_infographic',
        name: 'Modern Resume Bio',
        desc: 'Cream two-column bio layout with sketchy oval frame, timelines, and sleek dark details.',
        category: 'Infographics', emoji: '📝', thumbBg: 'linear-gradient(135deg, #faf7f0, #eae2d2)',
        w: 800, h: 1000, bgColor: '#FFFDF9',
        elements: [
            { type: 'shape', shape: 'rect', x: 400, y: 500, w: 740, h: 940, fill: 'transparent', stroke: '#C2B280', strokeWidth: 2 },
            { type: 'frame', shape: 'oval', x: 220, y: 240, w: 180, h: 240, src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'AMELIA CARTER', x: 510, y: 200, s: 32, w: 280, f: '#2F4F4F', align: 'left', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'text', text: 'CREATIVE GRAPHICS DIRECTOR', x: 510, y: 250, s: 12, w: 280, f: '#C2B280', align: 'left', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 400, y: 480, w: 480, h: 95, fill: '#FAF0E6', stroke: '#C2B280', st: 'zoom', d: 0.4 },
            { type: 'text', text: '2024 - PRESENT // DESIGN PRINCIPAL\nLed visual branding and organic sketchy design integrations.', x: 400, y: 480, s: 11, w: 440, f: '#2F4F4F', align: 'left' },
            { type: 'shape', shape: 'rounded_rect', x: 400, y: 630, w: 480, h: 95, fill: '#FAF0E6', stroke: '#C2B280', st: 'zoom', d: 0.6 },
            { type: 'text', text: '2022 - 2024 // SR. INTERACTIVE DESIGNER\nDesigned dynamic infographics and physics-based transitions.', x: 400, y: 630, s: 11, w: 440, f: '#2F4F4F', align: 'left' },
            { type: 'shape', shape: 'rounded_rect', x: 400, y: 780, w: 480, h: 95, fill: '#FAF0E6', stroke: '#C2B280', st: 'zoom', d: 0.8 },
            { type: 'text', text: '2020 - 2022 // JUNIOR BRAND STYLIST\nEstablished custom vector brush styles and typography boards.', x: 400, y: 780, s: 11, w: 440, f: '#2F4F4F', align: 'left' }
        ],
        connections: [
            { from: 4, to: 6, color: '#C2B280' },
            { from: 6, to: 8, color: '#C2B280' }
        ]
    },
    {
        id: 'minimalist_portfolio',
        name: 'Minimalist Portfolio',
        desc: 'Clean neutral styling, large square image frame, modern titles for showcasing design artwork.',
        category: 'Marketing', emoji: '🖼️', thumbBg: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)',
        w: 900, h: 600, bgColor: '#F9FAFB',
        elements: [
            { type: 'frame', shape: 'square', x: 580, y: 300, w: 350, h: 350, src: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'BALANCED', x: 240, y: 190, s: 48, w: 300, f: '#111827', align: 'left', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'text', text: 'VOL. 01 // ESSENCE OF FORMS', x: 240, y: 245, s: 13, w: 300, f: '#9CA3AF', align: 'left', weight: 'bold' },
            { type: 'text', text: 'A curated catalog of design layouts focusing on extreme simplicity, high-contrast borders, and vector hand-drawn elements.', x: 240, y: 325, s: 12, w: 280, f: '#374151', align: 'left' },
            { type: 'shape', shape: 'rounded_rect', x: 200, y: 440, w: 140, h: 40, fill: '#111827', stroke: 'transparent', st: 'zoom', d: 0.4 },
            { type: 'text', text: 'EXPLORE MORE', x: 200, y: 440, s: 10, w: 120, f: '#F9FAFB', weight: 'bold' }
        ]
    },
    {
        id: 'summer_festival',
        name: 'Summer Festival Flyer',
        desc: 'Warm orange-yellow gradient, puffy cloud frame, and party schedules with spring reveals.',
        category: 'Marketing', emoji: '☀️', thumbBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
        w: 900, h: 600, bgColor: '#FFFBEB',
        elements: [
            { type: 'shape', shape: 'rect', x: 450, y: 300, w: 820, h: 520, fill: '#FEF3C7', stroke: '#F59E0B', strokeWidth: 2 },
            { type: 'frame', shape: 'cloud', x: 580, y: 300, w: 340, h: 250, src: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'SUMMER VIBES', x: 260, y: 160, s: 40, w: 300, f: '#B45309', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'text', text: 'LIVE MUSIC • GOURMET FOOD • CRAFT DRINKS', x: 260, y: 215, s: 11, w: 300, f: '#D97706', weight: 'bold' },
            { type: 'text', text: 'Gather under the open sky for a full weekend of analog synth performances and custom arts & crafts.', x: 260, y: 275, s: 12, w: 280, f: '#78350F', st: 'fade', d: 0.4 },
            { type: 'shape', shape: 'circle', x: 190, y: 400, w: 100, h: 100, fill: '#F59E0B', stroke: '#B45309', strokeWidth: 1.5, st: 'zoom', d: 0.6 },
            { type: 'text', text: 'JULY\n15-17', x: 190, y: 400, s: 12, w: 80, f: '#78350F', weight: 'bold' }
        ]
    },
    {
        id: 'restaurant_menu',
        name: 'Sleek Restaurant Menu',
        desc: 'Dark blackboard chalk theme, wobbly 5-petal flower food picture frame, and items list.',
        category: 'Marketing', emoji: '🍷', thumbBg: 'linear-gradient(135deg, #111827, #1f2937)',
        w: 900, h: 600, bgColor: '#0F172A',
        elements: [
            { type: 'shape', shape: 'rect', x: 450, y: 300, w: 840, h: 540, fill: 'transparent', stroke: '#F59E0B', strokeWidth: 1.5 },
            { type: 'frame', shape: 'flower', x: 250, y: 300, w: 280, h: 280, src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'GOURMET FLAVORS', x: 600, y: 95, s: 32, w: 300, f: '#F59E0B', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'text', text: '• STARTERS •', x: 600, y: 160, s: 13, w: 300, f: '#D4AF37', weight: 'bold' },
            { type: 'text', text: 'Truffle Mushroom Fries ......... $12\nCrispy Calamari Basket .......... $15\nClassic Caesar Salad ............. $11', x: 600, y: 220, s: 12, w: 320, f: '#E2E8F0', st: 'fade', d: 0.4 },
            { type: 'text', text: '• SIGNATURE MAINS •', x: 600, y: 310, s: 13, w: 300, f: '#D4AF37', weight: 'bold' },
            { type: 'text', text: 'Aged Wagyu Steak (10oz) ........ $48\nPan-Seared Salmon Fillet ........ $36\nWild Truffle Gnocchi ............ $28', x: 600, y: 370, s: 12, w: 320, f: '#E2E8F0', st: 'fade', d: 0.6 }
        ]
    },
    {
        id: 'corporate_stats',
        name: 'Corporate Analytics',
        desc: 'Navy-gold gradient with wobbly statistical cards, rectangle frame, and growth timelines.',
        category: 'Slides', emoji: '📈', thumbBg: 'linear-gradient(135deg, #1e3a8a, #172554)',
        w: 900, h: 600, bgColor: '#0B0F19',
        elements: [
            { type: 'frame', shape: 'rectangle', x: 580, y: 310, w: 340, h: 240, src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'ANNUAL ANALYTICS', x: 240, y: 130, s: 30, w: 300, f: '#E2E8F0', textAlign: 'left', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 230, y: 240, w: 280, h: 70, fill: '#1E293B', stroke: '#D4AF37', st: 'slide_right', d: 0.3 },
            { type: 'text', text: '📈 +142% Yearly Sales Growth', x: 230, y: 240, s: 12, w: 240, f: '#F1F5F9', align: 'left', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 230, y: 340, w: 280, h: 70, fill: '#1E293B', stroke: '#D4AF37', st: 'slide_right', d: 0.5 },
            { type: 'text', text: '👥 520k+ New Active Users', x: 230, y: 340, s: 12, w: 240, f: '#F1F5F9', align: 'left', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 230, y: 440, w: 280, h: 70, fill: '#1E293B', stroke: '#D4AF37', st: 'slide_right', d: 0.7 },
            { type: 'text', text: '🌍 24 Countries Expanded', x: 230, y: 440, s: 12, w: 240, f: '#F1F5F9', align: 'left', weight: 'bold' }
        ]
    },
    {
        id: 'retro_music',
        name: 'Retro Music Event',
        desc: 'Cozy teal & cream dual-tone layout, sketchy diamond frame, and wobbly music stickers.',
        category: 'Art & Posters', emoji: '📻', thumbBg: 'linear-gradient(135deg, #e6f0ee, #b6d0cc)',
        w: 900, h: 600, bgColor: '#FAF6F0',
        elements: [
            { type: 'shape', shape: 'rect', x: 450, y: 300, w: 820, h: 520, fill: 'transparent', stroke: '#0E7490', strokeWidth: 2 },
            { type: 'frame', shape: 'diamond', x: 260, y: 300, w: 280, h: 280, src: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'ANALOG SOUNDS', x: 600, y: 150, s: 34, w: 300, f: '#0E7490', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'text', text: 'Retro Vinyl & Synth Live Set', x: 600, y: 190, s: 14, w: 300, f: '#0891B2' },
            { type: 'text', text: '📻 High-Fidelity Vacuum Tube Systems', x: 600, y: 260, s: 12, w: 320, f: '#1F2937', align: 'left', st: 'fade', d: 0.4 },
            { type: 'text', text: '🕒 Every Thursday Evening, 9:00 PM', x: 600, y: 310, s: 12, w: 320, f: '#1F2937', align: 'left', st: 'fade', d: 0.6 },
            { type: 'text', text: '📍 The Electric Basement Speakeasy', x: 600, y: 360, s: 12, w: 320, f: '#1F2937', align: 'left', st: 'fade', d: 0.8 },
            { type: 'shape', shape: 'rounded_rect', x: 600, y: 445, w: 140, h: 40, fill: '#0E7490', stroke: 'transparent', st: 'zoom', d: 0.9 },
            { type: 'text', text: 'FREE ENTRY', x: 600, y: 445, s: 10, w: 120, f: '#FAF6F0', weight: 'bold' }
        ]
    },
    {
        id: 'ecom_sale',
        name: 'E-Commerce Flash Sale',
        desc: 'Square portrait banner, large sketchy shield frame, and massive bold sale typography.',
        category: 'Marketing', emoji: '🛍️', thumbBg: 'linear-gradient(135deg, #ec4899, #f43f5e)',
        w: 800, h: 800, bgColor: '#FDF2F8',
        elements: [
            { type: 'shape', shape: 'rect', x: 400, y: 400, w: 720, h: 720, fill: 'transparent', stroke: '#DB2777', strokeWidth: 2 },
            { type: 'frame', shape: 'shield', x: 400, y: 370, w: 300, h: 300, src: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop&q=80' },
            { type: 'text', text: 'FLASH SALE', x: 400, y: 100, s: 52, w: 500, f: '#DB2777', st: 'zoom', d: 0.2, weight: 'bold' },
            { type: 'text', text: 'LIMITED EDITION RELEASE', x: 400, y: 155, s: 12, w: 300, f: '#BE185D', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 400, y: 580, w: 360, h: 60, fill: '#FDE047', stroke: '#DB2777', st: 'zoom', d: 0.5 },
            { type: 'text', text: 'SHOP NOW - UP TO 60% OFF', x: 400, y: 580, s: 13, w: 300, f: '#9D174D', weight: 'bold' },
            { type: 'text', text: '*Discount applied automatically at checkout.', x: 400, y: 660, s: 11, w: 300, f: '#9CA3AF' }
        ]
    },
    
    // ==========================================
    // ROBOTICS & ACTUATORS CATEGORY
    // ==========================================
    {
        id: 'robotic_arm_anatomy',
        name: 'Robotic Arm Joints',
        desc: 'Servo actuator joint layout and coordinate mechanics on industrial robotic arms.',
        category: 'Robotics', emoji: '🦾', thumbBg: 'linear-gradient(135deg, #0284c7, #0369a1)',
        w: 900, h: 600, bgColor: '#0F172A',
        elements: [
            { type: 'text', text: 'ROBOTIC ARM JOINT ANATOMY', x: 450, y: 70, s: 32, w: 600, f: '#D4AF37', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'text', text: 'Micro-Actuator Servo Mapping Diagram', x: 450, y: 110, s: 14, w: 600, f: '#94A3B8' },
            { type: 'shape', shape: 'rounded_rect', x: 180, y: 220, w: 160, h: 80, fill: '#1E293B', stroke: '#D4AF37', st: 'zoom', d: 0.2 },
            { type: 'text', text: '1. BASE ACTUATOR\nHigh-torque servo base', x: 180, y: 220, s: 11, w: 140, f: '#D4AF37', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 220, w: 160, h: 80, fill: '#1E293B', stroke: '#D4AF37', st: 'zoom', d: 0.4 },
            { type: 'text', text: '2. ELBOW ROTATOR\n90-deg angle sweep', x: 450, y: 220, s: 11, w: 140, f: '#D4AF37', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 720, y: 220, w: 160, h: 80, fill: '#1E293B', stroke: '#D4AF37', st: 'zoom', d: 0.6 },
            { type: 'text', text: '3. WRIST GRIPPER\nServo pneumatic valve', x: 720, y: 220, s: 11, w: 140, f: '#D4AF37', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 430, w: 320, h: 220, src: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600' }
        ],
        connections: [
            { from: 2, to: 4, color: '#D4AF37' },
            { from: 4, to: 6, color: '#D4AF37' }
        ]
    },
    {
        id: 'humanoid_sensors',
        name: 'Humanoid Sensor Array',
        desc: 'LiDAR, stereoscopic cameras, and sonar sensors positioning on humanoid robotic heads.',
        category: 'Robotics', emoji: '🤖', thumbBg: 'linear-gradient(135deg, #1e1b4b, #311042)',
        w: 900, h: 600, bgColor: '#02000A',
        elements: [
            { type: 'text', text: 'HUMANOID SENSOR PERCEPTION', x: 450, y: 70, s: 30, w: 600, f: '#06B6D4', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 450, y: 320, w: 260, h: 260, fill: '#0F172A', stroke: '#06B6D4' },
            { type: 'text', text: 'CENTRAL\nCPU SYSTEM', x: 450, y: 320, s: 14, w: 200, f: '#E2E8F0', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 180, y: 200, w: 150, h: 70, fill: '#1E293B', stroke: '#06B6D4', st: 'slide_right', d: 0.3 },
            { type: 'text', text: '👀 STEREOSCOPIC\nDepth cameras', x: 180, y: 200, s: 11, w: 130, f: '#06B6D4', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 720, y: 200, w: 150, h: 70, fill: '#1E293B', stroke: '#06B6D4', st: 'slide_left', d: 0.5 },
            { type: 'text', text: '📡 LiDAR SWEEP\nDistance scanner', x: 720, y: 200, s: 11, w: 130, f: '#06B6D4', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 490, w: 150, h: 70, fill: '#1E293B', stroke: '#06B6D4', st: 'zoom', d: 0.7 },
            { type: 'text', text: '🎤 AUDIO ARRAY\nSpeech synthesis', x: 450, y: 490, s: 11, w: 130, f: '#06B6D4', weight: 'bold' }
        ],
        connections: [
            { from: 3, to: 1, color: '#06B6D4' },
            { from: 5, to: 1, color: '#06B6D4' },
            { from: 7, to: 1, color: '#06B6D4' }
        ]
    },
    {
        id: 'drone_anatomy',
        name: 'Autonomous Drone',
        desc: 'Quadcopter mechanics diagram charting ESC regulators, flight controllers, and motors.',
        category: 'Robotics', emoji: '🚁', thumbBg: 'linear-gradient(135deg, #115e59, #134e4a)',
        w: 900, h: 600, bgColor: '#064E3B',
        elements: [
            { type: 'text', text: 'AUTONOMOUS QUADCOPTER MECHANICS', x: 450, y: 70, s: 28, w: 600, f: '#A7F3D0', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 260, w: 160, h: 80, fill: '#022C22', stroke: '#34D399', rx: 10, ry: 10 },
            { type: 'text', text: 'FLIGHT\nCONTROLLER IMU', x: 450, y: 260, s: 11, w: 140, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 180, y: 160, w: 100, h: 100, fill: '#022C22', stroke: '#34D399', st: 'zoom', d: 0.3 },
            { type: 'text', text: 'MOTOR 1', x: 180, y: 160, s: 11, w: 80, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 720, y: 160, w: 100, h: 100, fill: '#022C22', stroke: '#34D399', st: 'zoom', d: 0.4 },
            { type: 'text', text: 'MOTOR 2', x: 720, y: 160, s: 11, w: 80, f: '#34D399', weight: 'bold' },
            { type: 'frame', shape: 'phone', x: 450, y: 460, w: 180, h: 220, src: 'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=600' }
        ],
        connections: [
            { from: 3, to: 1, color: '#34D399' },
            { from: 5, to: 1, color: '#34D399' }
        ]
    },
    {
        id: 'surgical_bot',
        name: 'Surgical Endoscope',
        desc: 'High-precision micro-servo robotic surgical actuators and doctor telemetry loops.',
        category: 'Robotics', emoji: '🔬', thumbBg: 'linear-gradient(135deg, #0f766e, #0f172a)',
        w: 900, h: 600, bgColor: '#031514',
        elements: [
            { type: 'text', text: 'ROBOTIC SURGICAL ENDOSCOPE', x: 450, y: 65, s: 30, w: 600, f: '#2DD4BF', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 220, w: 220, h: 80, fill: '#052E16', stroke: '#2DD4BF', rx: 12, ry: 12 },
            { type: 'text', text: 'HAPTIC INTERACTION RACK\nPhysician Command Unit', x: 450, y: 220, s: 11, w: 200, f: '#2DD4BF', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 180, y: 380, w: 180, h: 80, fill: '#02181E', stroke: '#2DD4BF', st: 'slide_right', d: 0.4 },
            { type: 'text', text: '🧬 MICRO ACTUATOR\nTendon flex controller', x: 180, y: 380, s: 11, w: 160, f: '#2DD4BF', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 720, y: 380, w: 180, h: 80, fill: '#02181E', stroke: '#2DD4BF', st: 'slide_left', d: 0.6 },
            { type: 'text', text: '🎥 OPTICAL FIBER\n4K Stereo Endoscope', x: 720, y: 380, s: 11, w: 160, f: '#2DD4BF', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#2DD4BF' },
            { from: 1, to: 5, color: '#2DD4BF' }
        ]
    },
    {
        id: 'mars_rover',
        name: 'Mars Exploration Rover',
        desc: 'Guidance computer, laser spectrometer antenna, and direct-to-Earth RF beacons.',
        category: 'Robotics', emoji: '🪐', thumbBg: 'linear-gradient(135deg, #7c2d12, #451a03)',
        w: 900, h: 600, bgColor: '#2C1305',
        elements: [
            { type: 'text', text: 'MARS ROVER CENTRAL TELEMETRY', x: 450, y: 65, s: 28, w: 600, f: '#FFEDD5', st: 'zoom', d: 0.1, weight: 'bold' },
            // Center main computer
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 280, w: 210, h: 90, fill: '#1A0B02', stroke: '#F97316', rx: 12, ry: 12 },
            { type: 'text', text: '🛰️ ROVER CENTRAL CPU\nRAD750 onboard computer', x: 450, y: 280, s: 11, w: 190, f: '#F97316', weight: 'bold' },
            // Peripheral 1: IMU
            { type: 'shape', shape: 'circle', x: 200, y: 180, w: 100, h: 100, fill: '#1A0B02', stroke: '#F97316', st: 'zoom', d: 0.3 },
            { type: 'text', text: '🌀 IMU GYRO\nInertial guidance', x: 200, y: 180, s: 10, w: 90, f: '#FFEDD5', weight: 'bold' },
            // Peripheral 2: Spectrometer
            { type: 'shape', shape: 'circle', x: 700, y: 180, w: 100, h: 100, fill: '#1A0B02', stroke: '#F97316', st: 'zoom', d: 0.4 },
            { type: 'text', text: '🔬 LASER SPECT\nRock science unit', x: 700, y: 180, s: 10, w: 90, f: '#FFEDD5', weight: 'bold' },
            // Peripheral 3: RTG
            { type: 'shape', shape: 'circle', x: 200, y: 380, w: 100, h: 100, fill: '#1A0B02', stroke: '#F97316', st: 'zoom', d: 0.5 },
            { type: 'text', text: '🔋 RTG POWER\nNuclear energy volt', x: 200, y: 380, s: 10, w: 90, f: '#FFEDD5', weight: 'bold' },
            // Peripheral 4: RF S-Band
            { type: 'shape', shape: 'circle', x: 700, y: 380, w: 100, h: 100, fill: '#1A0B02', stroke: '#F97316', st: 'zoom', d: 0.6 },
            { type: 'text', text: '📡 RF BEACON\nS-Band direct downlink', x: 700, y: 380, s: 10, w: 90, f: '#FFEDD5', weight: 'bold' },
            // Frame: Actual Mars Rover Photo
            { type: 'frame', shape: 'rectangle', x: 450, y: 475, w: 190, h: 130, src: 'https://images.unsplash.com/photo-1612892483236-40d68a86b480?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#F97316' },
            { from: 1, to: 5, color: '#F97316' },
            { from: 1, to: 7, color: '#F97316' },
            { from: 1, to: 9, color: '#F97316' }
        ]
    },
    {
        id: 'bionic_hand',
        name: 'Bionic Hand Servos',
        desc: 'Advanced robotic hand blueprint mapping tactile glove sensors to actuator drivers.',
        category: 'Robotics', emoji: '🖐️', thumbBg: 'linear-gradient(135deg, #06b6d4, #0891b2)',
        w: 900, h: 600, bgColor: '#083344',
        elements: [
            { type: 'text', text: 'BIONIC JOINT ACTUATION SYSTEM', x: 450, y: 65, s: 28, w: 600, f: '#22D3EE', st: 'zoom', d: 0.1, weight: 'bold' },
            // Center main controller
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 250, w: 200, h: 90, fill: '#164E63', stroke: '#22D3EE', rx: 12, ry: 12 },
            { type: 'text', text: '🎛️ ACTUATION CONTROLLER\nTendon driver central unit', x: 450, y: 250, s: 10, w: 180, f: '#22D3EE', weight: 'bold' },
            // Thumb
            { type: 'shape', shape: 'rounded_rect', x: 200, y: 190, w: 150, h: 70, fill: '#164E63', stroke: '#22D3EE', rx: 12, ry: 12 },
            { type: 'text', text: '🦾 THUMB ACTUATOR\nMicro servo joint 1', x: 200, y: 190, s: 10, w: 130, f: '#E2E8F0', weight: 'bold' },
            // Index
            { type: 'shape', shape: 'rounded_rect', x: 700, y: 190, w: 150, h: 70, fill: '#164E63', stroke: '#22D3EE', rx: 12, ry: 12 },
            { type: 'text', text: '🦾 INDEX ACTUATOR\nMicro servo joint 2', x: 700, y: 190, s: 10, w: 130, f: '#E2E8F0', weight: 'bold' },
            // Tactile feedback
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 430, w: 200, h: 75, fill: '#164E63', stroke: '#22D3EE', rx: 12, ry: 12 },
            { type: 'text', text: '🔔 TACTILE FEEDBACK\nSkin haptic sensor matrix', x: 450, y: 430, s: 10, w: 180, f: '#22D3EE', weight: 'bold' },
            // Frame bionic hand
            { type: 'frame', shape: 'rectangle', x: 200, y: 430, w: 140, h: 180, src: 'https://images.unsplash.com/photo-1589254065878-42c9da997008?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#22D3EE' },
            { from: 1, to: 5, color: '#22D3EE' },
            { from: 7, to: 1, color: '#22D3EE' }
        ]
    },
    {
        id: 'vacuum_path',
        name: 'LiDAR Vacuum Planner',
        desc: 'Mapping collision boundaries, docking nodes, and autonomous sweep grids.',
        category: 'Robotics', emoji: '🧹', thumbBg: 'linear-gradient(135deg, #4f46e5, #4338ca)',
        w: 900, h: 600, bgColor: '#1E1B4B',
        elements: [
            { type: 'text', text: 'AUTONOMOUS LiDAR VACUUM SWEEP', x: 450, y: 70, s: 28, w: 600, f: '#C7D2FE', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 300, y: 320, w: 220, h: 220, fill: '#312E81', stroke: '#818CF8' },
            { type: 'text', text: 'VACUUM CPU\nLiDAR Sweep Hub', x: 300, y: 320, s: 12, w: 160, f: '#818CF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 220, w: 180, h: 80, fill: '#312E81', stroke: '#818CF8', st: 'zoom', d: 0.4 },
            { type: 'text', text: '⚡ CHARGING BAY\nAutomatic dock-in', x: 640, y: 220, s: 11, w: 160, f: '#818CF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 420, w: 180, h: 80, fill: '#312E81', stroke: '#818CF8', st: 'zoom', d: 0.6 },
            { type: 'text', text: '🚨 WALL INFRARED\nCollision sensors', x: 640, y: 420, s: 11, w: 160, f: '#818CF8', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#818CF8' },
            { from: 1, to: 5, color: '#818CF8' }
        ]
    },
    {
        id: 'cobot_safety',
        name: 'Collaborative Robocall',
        desc: 'Robotic zones, scanner shields, and safety brakes mapping industrial workflows.',
        category: 'Robotics', emoji: '🤝', thumbBg: 'linear-gradient(135deg, #1e293b, #0f172a)',
        w: 900, h: 600, bgColor: '#090D16',
        elements: [
            { type: 'text', text: 'COBOT SAFETY OVERLAY', x: 450, y: 65, s: 30, w: 600, f: '#E2E8F0', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 240, y: 220, w: 200, h: 90, fill: '#1E293B', stroke: '#F59E0B', rx: 12, ry: 12 },
            { type: 'text', text: '🎛️ SPEED CONTROLLER\nProximity laser halts', x: 240, y: 220, s: 11, w: 180, f: '#F59E0B', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 220, w: 200, h: 90, fill: '#1E293B', stroke: '#EF4444', rx: 12, ry: 12 },
            { type: 'text', text: '🛑 EMERGENCY BRAKE\nPneumatic joint locks', x: 640, y: 220, s: 11, w: 180, f: '#EF4444', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#EF4444' }
        ]
    },
    {
        id: 'agv_warehouse',
        name: 'AGV Warehouse Lifter',
        desc: 'Automated forklift pathways, barcode grid, and server route calculations.',
        category: 'Robotics', emoji: '🚚', thumbBg: 'linear-gradient(135deg, #0f172a, #1e293b)',
        w: 900, h: 600, bgColor: '#0F172A',
        elements: [
            { type: 'text', text: 'AGV DISPATCH WORKSPACE', x: 450, y: 70, s: 28, w: 600, f: '#F8FAFC', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 200, y: 240, w: 180, h: 80, fill: '#1E293B', stroke: '#38BDF8' },
            { type: 'text', text: '💾 ROUTE SERVER\nCentral AGV controller', x: 200, y: 240, s: 11, w: 160, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 240, w: 180, h: 80, fill: '#1E293B', stroke: '#38BDF8' },
            { type: 'text', text: '🚚 LIFTER AGV\nForklift sensor chassis', x: 450, y: 240, s: 11, w: 160, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 700, y: 240, w: 180, h: 80, fill: '#1E293B', stroke: '#38BDF8' },
            { type: 'text', text: '⚡ CHARGING GATE\nAutomated dock stations', x: 700, y: 240, s: 11, w: 160, f: '#38BDF8', weight: 'bold' },
            { type: 'frame', shape: 'laptop', x: 450, y: 445, w: 320, h: 220, src: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#38BDF8' },
            { from: 3, to: 5, color: '#38BDF8' }
        ]
    },
    {
        id: 'pneumatic_solenoid',
        name: 'Pneumatic Valves',
        desc: 'Compressor flow regulator, MOSFET valve solenoids, and active cylinders.',
        category: 'Robotics', emoji: '💨', thumbBg: 'linear-gradient(135deg, #10b981, #047857)',
        w: 900, h: 600, bgColor: '#064E3B',
        elements: [
            { type: 'text', text: 'PNEUMATIC SOLENOID VALVE SYSTEM', x: 450, y: 65, s: 30, w: 600, f: '#A7F3D0', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 220, y: 320, w: 200, h: 200, fill: '#022C22', stroke: '#34D399' },
            { type: 'text', text: 'TANK PRESSURE\nSolenoid control regulator', x: 220, y: 320, s: 12, w: 160, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 600, y: 220, w: 180, h: 80, fill: '#022C22', stroke: '#34D399', st: 'zoom', d: 0.4 },
            { type: 'text', text: '⚡ SOLENOID GATE\nValve 5/2 logic', x: 600, y: 220, s: 11, w: 160, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 600, y: 420, w: 180, h: 80, fill: '#022C22', stroke: '#34D399', st: 'zoom', d: 0.6 },
            { type: 'text', text: '🔧 PISTON ARM\nPneumatic actuator', x: 600, y: 420, s: 11, w: 160, f: '#34D399', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#34D399' },
            { from: 3, to: 5, color: '#34D399' }
        ]
    },
    {
        id: 'motor_driver_bldc',
        name: 'BLDC Motor Driver',
        desc: 'EV speed controllers, MOSFET H-bridges, and brushless coils diagram.',
        category: 'Robotics', emoji: '🔌', thumbBg: 'linear-gradient(135deg, #1e1b4b, #111827)',
        w: 900, h: 600, bgColor: '#0E0B24',
        elements: [
            { type: 'text', text: 'BLDC SPEED CONTROLLER DRIVER', x: 450, y: 65, s: 30, w: 600, f: '#A855F7', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 260, y: 220, w: 200, h: 80, fill: '#1E1B4B', stroke: '#C084FC', rx: 12, ry: 12 },
            { type: 'text', text: 'MOSFET H-BRIDGE\nHigh-speed gate driver', x: 260, y: 220, s: 11, w: 180, f: '#C084FC', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 220, w: 200, h: 80, fill: '#1E1B4B', stroke: '#C084FC', rx: 12, ry: 12 },
            { type: 'text', text: '⚡ PHASE OUTPUT\nMCU controller feedback', x: 620, y: 220, s: 11, w: 180, f: '#C084FC', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#C084FC' }
        ]
    },
    {
        id: 'exoskeleton_suit',
        name: 'Exoskeleton Suit',
        desc: 'Hip flexor joints, knee cylinder actuators, and sensor telemetry assistant paths.',
        category: 'Robotics', emoji: '🦵', thumbBg: 'linear-gradient(135deg, #047857, #065f46)',
        w: 900, h: 600, bgColor: '#064E3B',
        elements: [
            { type: 'text', text: 'POWER ASSIST EXOSKELETON', x: 450, y: 70, s: 28, w: 600, f: '#D1FAE5', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 200, y: 240, w: 180, h: 80, fill: '#022C22', stroke: '#10B981' },
            { type: 'text', text: '💪 HIP ACTUATOR\nFlexible power assist', x: 200, y: 240, s: 11, w: 160, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 240, w: 180, h: 80, fill: '#022C22', stroke: '#10B981' },
            { type: 'text', text: '⚙️ KNEE JOINT\nHydraulic load cylinders', x: 450, y: 240, s: 11, w: 160, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 700, y: 240, w: 180, h: 80, fill: '#022C22', stroke: '#10B981' },
            { type: 'text', text: '🚨 ANKLE SENSOR\nPressure triggers', x: 700, y: 240, s: 11, w: 160, f: '#10B981', weight: 'bold' },
            { type: 'frame', shape: 'laptop', x: 450, y: 445, w: 320, h: 220, src: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#10B981' },
            { from: 3, to: 5, color: '#10B981' }
        ]
    },
    {
        id: 'marine_rov_sonar',
        name: 'Underwater Sonar ROV',
        desc: 'Underwater ROV probes, LED spotlight array, and optical tether connections.',
        category: 'Robotics', emoji: '⚓', thumbBg: 'linear-gradient(135deg, #0e7490, #155e75)',
        w: 900, h: 600, bgColor: '#083344',
        elements: [
            { type: 'text', text: 'UNDERWATER EXPLORATION ROV', x: 450, y: 65, s: 30, w: 600, f: '#22D3EE', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 260, y: 300, w: 220, h: 220, fill: '#164E63', stroke: '#22D3EE' },
            { type: 'text', text: 'SONAR HUB\nOptical fiber feed', x: 260, y: 300, s: 12, w: 160, f: '#22D3EE', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 220, w: 180, h: 80, fill: '#164E63', stroke: '#22D3EE', st: 'zoom', d: 0.4 },
            { type: 'text', text: '💡 LED SPOTLIGHT\nHigh-power beacons', x: 620, y: 220, s: 11, w: 160, f: '#22D3EE', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 380, w: 180, h: 80, fill: '#164E63', stroke: '#22D3EE', st: 'zoom', d: 0.6 },
            { type: 'text', text: '🦾 MECHANICAL GRIP\nUnderwater scoop arm', x: 620, y: 380, s: 11, w: 160, f: '#22D3EE', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#22D3EE' },
            { from: 1, to: 5, color: '#22D3EE' }
        ]
    },
    {
        id: 'agricultural_drone',
        name: 'Crop Sprayer Drone',
        desc: 'Field survey parameters, flight boundaries, and waypoint route mappings.',
        category: 'Robotics', emoji: '🌾', thumbBg: 'linear-gradient(135deg, #0f766e, #134e4a)',
        w: 900, h: 600, bgColor: '#0D3C32',
        elements: [
            { type: 'text', text: 'AGRICULTURAL WAYPOINT SCHEME', x: 450, y: 70, s: 28, w: 600, f: '#F0FDF4', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 450, y: 300, w: 820, h: 480, fill: 'transparent', stroke: '#10B981', strokeWidth: 1.5 },
            { type: 'shape', shape: 'rounded_rect', x: 260, y: 220, w: 200, h: 80, fill: '#062F22', stroke: '#34D399', rx: 12, ry: 12 },
            { type: 'text', text: '🌾 FIELD BOUNDARY\nSurveying camera feeds', x: 260, y: 220, s: 11, w: 180, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 220, w: 200, h: 80, fill: '#062F22', stroke: '#34D399', rx: 12, ry: 12 },
            { type: 'text', text: '🛰️ WAYPOINT ROUTE\nCrop spraying spray tank', x: 620, y: 220, s: 11, w: 180, f: '#34D399', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=600' }
        ],
        connections: [
            { from: 2, to: 4, color: '#34D399' }
        ]
    },
    {
        id: 'industrial_plc',
        name: 'Industrial PLC Racks',
        desc: 'CPU controllers, analog inputs, and high-voltage power relay connections.',
        category: 'Robotics', emoji: '🎛️', thumbBg: 'linear-gradient(135deg, #1e293b, #0f172a)',
        w: 900, h: 600, bgColor: '#070D18',
        elements: [
            { type: 'text', text: 'INDUSTRIAL PLC LOGIC SCHEMATIC', x: 450, y: 65, s: 30, w: 600, f: '#D4AF37', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 200, y: 240, w: 180, h: 80, fill: '#1E293B', stroke: '#D4AF37' },
            { type: 'text', text: '🖥️ CPU CONTROLLER\nLogic micro-controller', x: 200, y: 240, s: 11, w: 160, f: '#D4AF37', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 240, w: 180, h: 80, fill: '#1E293B', stroke: '#D4AF37' },
            { type: 'text', text: '📊 ANALOG INPUTS\nThermal pressure lines', x: 450, y: 240, s: 11, w: 160, f: '#D4AF37', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 700, y: 240, w: 180, h: 80, fill: '#1E293B', stroke: '#D4AF37' },
            { type: 'text', text: '⚡ POWER RELAYS\nHigh voltage actuator output', x: 700, y: 240, s: 11, w: 160, f: '#D4AF37', weight: 'bold' },
            { type: 'frame', shape: 'laptop', x: 450, y: 445, w: 320, h: 220, src: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#D4AF37' },
            { from: 3, to: 5, color: '#D4AF37' }
        ]
    },
    
    // ==========================================
    // AI & COMPUTING INFOGRAPHICS CATEGORY
    // ==========================================
    {
        id: 'neural_network',
        name: 'Deep Neural Network',
        desc: 'Fully connected multilayer AI layout mapping input, hidden, and output nodes.',
        category: 'Infographics', emoji: '🧠', thumbBg: 'linear-gradient(135deg, #4f46e5, #3730a3)',
        w: 900, h: 600, bgColor: '#0F172A',
        elements: [
            { type: 'text', text: 'DEEP LEARNING NEURAL TOPOLOGY', x: 450, y: 65, s: 30, w: 600, f: '#818CF8', st: 'zoom', d: 0.1, weight: 'bold' },
            // Input layer
            { type: 'shape', shape: 'circle', x: 220, y: 200, w: 60, h: 60, fill: '#1E293B', stroke: '#818CF8', st: 'zoom', d: 0.2 },
            { type: 'shape', shape: 'circle', x: 220, y: 320, w: 60, h: 60, fill: '#1E293B', stroke: '#818CF8', st: 'zoom', d: 0.3 },
            { type: 'shape', shape: 'circle', x: 220, y: 440, w: 60, h: 60, fill: '#1E293B', stroke: '#818CF8', st: 'zoom', d: 0.4 },
            // Hidden layer
            { type: 'shape', shape: 'circle', x: 480, y: 260, w: 60, h: 60, fill: '#1E293B', stroke: '#6366F1', st: 'zoom', d: 0.5 },
            { type: 'shape', shape: 'circle', x: 480, y: 380, w: 60, h: 60, fill: '#1E293B', stroke: '#6366F1', st: 'zoom', d: 0.6 },
            // Output layer
            { type: 'shape', shape: 'circle', x: 740, y: 320, w: 60, h: 60, fill: '#1E293B', stroke: '#4F46E5', st: 'zoom', d: 0.7 }
        ],
        connections: [
            { from: 1, to: 4, color: '#818CF8' },
            { from: 2, to: 4, color: '#818CF8' },
            { from: 2, to: 5, color: '#818CF8' },
            { from: 3, to: 5, color: '#818CF8' },
            { from: 4, to: 6, color: '#6366F1' },
            { from: 5, to: 6, color: '#6366F1' }
        ]
    },
    {
        id: 'quantum_board',
        name: 'Quantum Qubit Board',
        desc: 'Superconducting qubit grids, central resonators, and qubit coupling gates.',
        category: 'Infographics', emoji: '🌌', thumbBg: 'linear-gradient(135deg, #1e1b4b, #111827)',
        w: 900, h: 600, bgColor: '#060216',
        elements: [
            { type: 'text', text: 'SUPERCONDUCTING QUBIT NETWORK', x: 450, y: 65, s: 28, w: 600, f: '#C084FC', st: 'zoom', d: 0.1, weight: 'bold' },
            // Center controller
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 300, w: 180, h: 90, fill: '#1E1B4B', stroke: '#A855F7', rx: 12, ry: 12 },
            { type: 'text', text: '🎛️ RF RESONATOR\nCentral control unit', x: 450, y: 300, s: 10, w: 160, f: '#C084FC', weight: 'bold' },
            // Qubit A
            { type: 'shape', shape: 'circle', x: 230, y: 200, w: 90, h: 90, fill: '#1E1B4B', stroke: '#A855F7', st: 'zoom', d: 0.3 },
            { type: 'text', text: '⚛️ QUBIT A\n12.5 GHz pulse', x: 230, y: 200, s: 10, w: 80, f: '#E879F9', weight: 'bold' },
            // Qubit B
            { type: 'shape', shape: 'circle', x: 670, y: 200, w: 90, h: 90, fill: '#1E1B4B', stroke: '#A855F7', st: 'zoom', d: 0.4 },
            { type: 'text', text: '⚛️ QUBIT B\n14.2 GHz pulse', x: 670, y: 200, s: 10, w: 80, f: '#E879F9', weight: 'bold' },
            // Qubit C
            { type: 'shape', shape: 'circle', x: 230, y: 400, w: 90, h: 90, fill: '#1E1B4B', stroke: '#A855F7', st: 'zoom', d: 0.5 },
            { type: 'text', text: '⚛️ QUBIT C\n11.8 GHz pulse', x: 230, y: 400, s: 10, w: 80, f: '#E879F9', weight: 'bold' },
            // Qubit D
            { type: 'shape', shape: 'circle', x: 670, y: 400, w: 90, h: 90, fill: '#1E1B4B', stroke: '#A855F7', st: 'zoom', d: 0.6 },
            { type: 'text', text: '⚛️ QUBIT D\n13.9 GHz pulse', x: 670, y: 400, s: 10, w: 80, f: '#E879F9', weight: 'bold' },
            // Dilution refrigerator photo frame
            { type: 'frame', shape: 'rectangle', x: 450, y: 475, w: 180, h: 120, src: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#A855F7' },
            { from: 1, to: 5, color: '#A855F7' },
            { from: 1, to: 7, color: '#A855F7' },
            { from: 1, to: 9, color: '#A855F7' },
            { from: 3, to: 7, color: '#C084FC' },
            { from: 5, to: 9, color: '#C084FC' }
        ]
    },
    {
        id: 'nlp_pipeline',
        name: 'NLP Tokenizer Pipe',
        desc: 'Language pipelines tracking tokenization, embeddings, self-attention, and soft-max.',
        category: 'Infographics', emoji: '🗣️', thumbBg: 'linear-gradient(135deg, #0c4a6e, #075985)',
        w: 900, h: 600, bgColor: '#0C4A6E',
        elements: [
            { type: 'text', text: 'NATURAL LANGUAGE PROCESSING PIPELINE', x: 450, y: 65, s: 30, w: 600, f: '#38BDF8', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 180, y: 240, w: 160, h: 80, fill: '#075985', stroke: '#38BDF8', st: 'zoom', d: 0.2 },
            { type: 'text', text: '1. TOKENIZATION\nWord-to-integer vector', x: 180, y: 240, s: 12, w: 140, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 450, y: 240, w: 160, h: 80, fill: '#075985', stroke: '#38BDF8', st: 'zoom', d: 0.4 },
            { type: 'text', text: '2. EMBEDDINGS\nHigh-dimension vector', x: 450, y: 240, s: 12, w: 140, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 450, y: 440, w: 160, h: 80, fill: '#075985', stroke: '#38BDF8', st: 'zoom', d: 0.6 },
            { type: 'text', text: '3. ATTENTION\nQuery-Key-Value scores', x: 450, y: 440, s: 12, w: 140, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 720, y: 440, w: 160, h: 80, fill: '#075985', stroke: '#38BDF8', st: 'zoom', d: 0.8 },
            { type: 'text', text: '4. SOFTMAX\nVocab probability output', x: 720, y: 440, s: 12, w: 140, f: '#38BDF8', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#38BDF8' },
            { from: 3, to: 5, color: '#38BDF8' },
            { from: 5, to: 7, color: '#38BDF8' }
        ]
    },
    {
        id: 'ai_chip_design',
        name: 'Edge AI Processor',
        desc: 'NPUs, SRAM caches, ALU cores, and micro-controller blueprints.',
        category: 'Infographics', emoji: '💾', thumbBg: 'linear-gradient(135deg, #18181b, #09090b)',
        w: 900, h: 600, bgColor: '#09090B',
        elements: [
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 300, w: 840, h: 520, fill: '#18181B', stroke: '#D4AF37', strokeWidth: 1.5, rx: 12, ry: 12 },
            { type: 'text', text: 'EDGE AI PROCESSOR ARCHITECTURE', x: 450, y: 130, s: 32, w: 600, f: '#D4AF37', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 230, y: 250, w: 280, h: 70, fill: '#27272A', stroke: '#D4AF37', st: 'slide_right', d: 0.3 },
            { type: 'text', text: '🧠 TENSOR CORE NPU\nParallel matrix engine', x: 230, y: 250, s: 12, w: 240, f: '#F4F4F5', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 230, y: 350, w: 280, h: 70, fill: '#27272A', stroke: '#D4AF37', st: 'slide_right', d: 0.5 },
            { type: 'text', text: '💾 SRAM L2 CACHE\nHigh bandwidth memory', x: 230, y: 350, s: 12, w: 240, f: '#F4F4F5', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 230, y: 440, w: 280, h: 70, fill: '#27272A', stroke: '#D4AF37', st: 'slide_right', d: 0.7 },
            { type: 'text', text: '🔌 DMA CONTROL BUS\nUltra-low power routing', x: 230, y: 440, s: 12, w: 240, f: '#F4F4F5', weight: 'bold' },
            { type: 'frame', shape: 'laptop', x: 620, y: 350, w: 320, h: 220, src: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600' }
        ]
    },
    {
        id: 'iot_gateway',
        name: 'IoT Edge Gateways',
        desc: 'Wide IoT network charting sensor nodes, gateways, and central databases.',
        category: 'Infographics', emoji: '🌐', thumbBg: 'linear-gradient(135deg, #047857, #065f46)',
        w: 900, h: 600, bgColor: '#064E3B',
        elements: [
            { type: 'text', text: 'IoT EDGE NETWORK TOPOLOGY', x: 450, y: 70, s: 28, w: 600, f: '#D1FAE5', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 450, y: 300, w: 200, h: 200, fill: '#022C22', stroke: '#10B981' },
            { type: 'text', text: 'CENTRAL\nGATEWAY HUB', x: 450, y: 300, s: 12, w: 160, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 160, y: 200, w: 140, h: 70, fill: '#022C22', stroke: '#10B981', st: 'zoom', d: 0.3 },
            { type: 'text', text: 'SENSOR 01', x: 160, y: 200, s: 11, w: 120, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 740, y: 200, w: 140, h: 70, fill: '#022C22', stroke: '#10B981', st: 'zoom', d: 0.5 },
            { type: 'text', text: 'SENSOR 02', x: 740, y: 200, s: 11, w: 120, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 490, w: 140, h: 70, fill: '#022C22', stroke: '#10B981', st: 'zoom', d: 0.7 },
            { type: 'text', text: 'DATABASE', x: 450, y: 490, s: 11, w: 120, f: '#10B981', weight: 'bold' }
        ],
        connections: [
            { from: 3, to: 1, color: '#10B981' },
            { from: 5, to: 1, color: '#10B981' },
            { from: 1, to: 7, color: '#10B981' }
        ]
    },
    {
        id: 'zero_trust_pipe',
        name: 'Zero-Trust Firewall',
        desc: 'Security pipelines mapping authentication, decryptions, sandboxes, and secure DBs.',
        category: 'Infographics', emoji: '🔒', thumbBg: 'linear-gradient(135deg, #be123c, #9f1239)',
        w: 900, h: 600, bgColor: '#4C0519',
        elements: [
            { type: 'text', text: 'ZERO-TRUST FIREWALL PIPELINE', x: 450, y: 65, s: 30, w: 600, f: '#FDA4AF', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 180, y: 240, w: 160, h: 80, fill: '#881337', stroke: '#FDA4AF', st: 'zoom', d: 0.2 },
            { type: 'text', text: '1. AUTHENTICATE\nMultifactor verification', x: 180, y: 240, s: 12, w: 140, f: '#FDA4AF', weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 450, y: 240, w: 160, h: 80, fill: '#881337', stroke: '#FDA4AF', st: 'zoom', d: 0.4 },
            { type: 'text', text: '2. DECRYPT\nTLS dynamic inspection', x: 450, y: 240, s: 12, w: 140, f: '#FDA4AF', weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 450, y: 440, w: 160, h: 80, fill: '#881337', stroke: '#FDA4AF', st: 'zoom', d: 0.6 },
            { type: 'text', text: '3. SANDBOX\nIsolated code scanner', x: 450, y: 440, s: 12, w: 140, f: '#FDA4AF', weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 720, y: 440, w: 160, h: 80, fill: '#881337', stroke: '#FDA4AF', st: 'zoom', d: 0.8 },
            { type: 'text', text: '4. SECURE DB\nEncrypted data logs', x: 720, y: 440, s: 12, w: 140, f: '#FDA4AF', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#FDA4AF' },
            { from: 3, to: 5, color: '#FDA4AF' },
            { from: 5, to: 7, color: '#FDA4AF' }
        ]
    },
    {
        id: 'big_data_lake',
        name: 'Big Data ETL Flow',
        desc: 'Extract, Transform, Load pipelines tracking raw data, cleaning, and databases.',
        category: 'Infographics', emoji: '🌊', thumbBg: 'linear-gradient(135deg, #0369a1, #075985)',
        w: 900, h: 600, bgColor: '#075985',
        elements: [
            { type: 'text', text: 'BIG DATA ETL PIPELINE FLOW', x: 450, y: 70, s: 28, w: 600, f: '#BAE6FD', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 260, y: 220, w: 200, h: 80, fill: '#0C4A6E', stroke: '#38BDF8', rx: 12, ry: 12 },
            { type: 'text', text: 'RAW DATA STREAM\nKafka real-time ingress', x: 260, y: 220, s: 11, w: 180, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 220, w: 200, h: 80, fill: '#0C4A6E', stroke: '#38BDF8', rx: 12, ry: 12 },
            { type: 'text', text: 'TRANSFORM HUB\nSpark cleaning clusters', x: 620, y: 220, s: 11, w: 180, f: '#38BDF8', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#38BDF8' }
        ]
    },
    {
        id: 'reinforcement_rl',
        name: 'Agent-Environment RL',
        desc: 'RL loops mapping agent, environment, actions, rewards, and states.',
        category: 'Infographics', emoji: '🔄', thumbBg: 'linear-gradient(135deg, #d97706, #b45309)',
        w: 900, h: 600, bgColor: '#78350F',
        elements: [
            { type: 'text', text: 'REINFORCEMENT LEARNING CYCLE', x: 450, y: 65, s: 30, w: 600, f: '#FEF3C7', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 250, y: 320, w: 200, h: 200, fill: '#92400E', stroke: '#FBBF24' },
            { type: 'text', text: '🧠 AGENT NPU\nPolicy calculations', x: 250, y: 320, s: 12, w: 160, f: '#FBBF24', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 240, w: 180, h: 80, fill: '#92400E', stroke: '#FBBF24', st: 'zoom', d: 0.4 },
            { type: 'text', text: '⚡ ACTION OUT\nState-space dynamics', x: 620, y: 240, s: 11, w: 160, f: '#FBBF24', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 400, w: 180, h: 80, fill: '#92400E', stroke: '#FBBF24', st: 'zoom', d: 0.6 },
            { type: 'text', text: '🔄 ENVIRONMENT\nState & reward feedback', x: 620, y: 400, s: 11, w: 160, f: '#FBBF24', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#FBBF24' },
            { from: 1, to: 5, color: '#FBBF24' }
        ]
    },
    {
        id: 'autonomous_perception',
        name: 'Sensor Fusion AV',
        desc: 'Camera feeds, radar echoes, and LiDAR fusing into path planners.',
        category: 'Infographics', emoji: '🚗', thumbBg: 'linear-gradient(135deg, #1e293b, #0f172a)',
        w: 900, h: 600, bgColor: '#080C14',
        elements: [
            { type: 'text', text: 'SENSOR FUSION AV PERCEPTION', x: 450, y: 70, s: 28, w: 600, f: '#F8FAFC', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 300, y: 320, w: 220, h: 220, fill: '#1E293B', stroke: '#38BDF8' },
            { type: 'text', text: 'FUSION CPU\nFocal path planner', x: 300, y: 320, s: 12, w: 160, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 220, w: 180, h: 80, fill: '#1E293B', stroke: '#38BDF8', st: 'zoom', d: 0.4 },
            { type: 'text', text: '📷 CAMERA FEED\nObstacle classifications', x: 640, y: 220, s: 11, w: 160, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 420, w: 180, h: 80, fill: '#1E293B', stroke: '#38BDF8', st: 'zoom', d: 0.6 },
            { type: 'text', text: '📡 RADAR PULSE\nSpeed & velocity inputs', x: 640, y: 420, s: 11, w: 160, f: '#38BDF8', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 3, color: '#38BDF8' },
            { from: 1, to: 5, color: '#38BDF8' }
        ]
    },
    
    // ==========================================
    // HARDWARE SYSTEMS & SCHEMATICS CATEGORY
    // ==========================================
    {
        id: 'ros2_pub_sub',
        name: 'ROS2 Topic pubsub',
        desc: 'ROS2 pub-sub topic structures mapping publisher and subscriber nodes.',
        id: 'battery_bms',
        name: 'EV Battery BMS Pack',
        desc: 'Symmetric cell balancing logic with active thermal sensing feedback loops.',
        category: 'Hardware Systems', emoji: '🔋', thumbBg: 'linear-gradient(135deg, #059669, #047857)',
        w: 900, h: 600, bgColor: '#064E3B',
        elements: [
            { type: 'text', text: 'EV BATTERY BMS CELL CONTROLLER', x: 450, y: 65, s: 28, w: 600, f: '#A7F3D0', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 220, w: 180, h: 80, fill: '#022C22', stroke: '#34D399', rx: 12, ry: 12 },
            { type: 'text', text: 'BMS CONTROLLER\nCentral microchip logic', x: 450, y: 220, s: 11, w: 160, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 180, y: 220, w: 100, h: 100, fill: '#022C22', stroke: '#10B981' },
            { type: 'text', text: '⚡ PACK CELL 1\nHigh-amp balance 1', x: 180, y: 220, s: 10, w: 90, f: '#A7F3D0', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 720, y: 220, w: 100, h: 100, fill: '#022C22', stroke: '#10B981' },
            { type: 'text', text: '⚡ PACK CELL 2\nHigh-amp balance 2', x: 720, y: 220, s: 10, w: 90, f: '#A7F3D0', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 380, w: 180, h: 80, fill: '#022C22', stroke: '#EF4444' },
            { type: 'text', text: '🌡️ THERMAL SENSOR\nReal-time temperature feedback', x: 450, y: 380, s: 10, w: 160, f: '#EF4444', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 500, w: 280, h: 120, src: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=600' }
        ],
        connections: [
            { from: 3, to: 1, color: '#10B981' },
            { from: 5, to: 1, color: '#10B981' },
            { from: 1, to: 7, color: '#EF4444' },
            { from: 7, to: 3, color: '#34D399' }
        ]
    },
    {
        id: 'agricultural_survey',
        name: 'Crop spraying drone',
        desc: 'Aerial crop survey grids mapping waypoints and spray tanks.',
        category: 'Hardware Systems', emoji: '🌾', thumbBg: 'linear-gradient(135deg, #0d9488, #0f766e)',
        w: 900, h: 600, bgColor: '#0D3C32',
        elements: [
            { type: 'text', text: 'CROP SPRAYING DRONE FLIGHT PLAN', x: 450, y: 70, s: 28, w: 600, f: '#E6F4EA', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rect', x: 450, y: 300, w: 820, h: 480, fill: 'transparent', stroke: '#34D399', strokeWidth: 1.5 },
            { type: 'shape', shape: 'rounded_rect', x: 260, y: 220, w: 200, h: 80, fill: '#062F22', stroke: '#34D399', rx: 12, ry: 12 },
            { type: 'text', text: '🌾 SPRAY PAYLOAD\nPrecision crop survey', x: 260, y: 220, s: 11, w: 180, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 620, y: 220, w: 200, h: 80, fill: '#062F22', stroke: '#34D399', rx: 12, ry: 12 },
            { type: 'text', text: '🛰️ WAYPOINT FLIGHT\nSpraying tank boundaries', x: 620, y: 220, s: 11, w: 180, f: '#34D399', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=600' }
        ],
        connections: [
            { from: 2, to: 4, color: '#34D399' }
        ]
    },
    
    // ==========================================
    // TECH PRESENTATION SLIDES CATEGORY
    // ==========================================
    {
        id: 'smart_city_grid',
        name: 'Smart City Grid System',
        desc: 'City-wide traffic, light grids, and solar microgrids connected to a central control hub.',
        category: 'Slides', emoji: '🏙️', thumbBg: 'linear-gradient(135deg, #1e3a8a, #0d1b3e)',
        w: 900, h: 600, bgColor: '#090F1E',
        elements: [
            { type: 'text', text: 'SMART CITY NETWORK ARCHITECTURE', x: 450, y: 65, s: 30, w: 600, f: '#E2E8F0', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 450, y: 280, w: 180, h: 180, fill: '#091E3E', stroke: '#0EA5E9' },
            { type: 'text', text: 'TRANSIT HUB\nCentral traffic brain', x: 450, y: 280, s: 12, w: 160, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 200, y: 180, w: 160, h: 80, fill: '#1E293B', stroke: '#38BDF8' },
            { type: 'text', text: '🏙️ LIGHT SENSORS\nTransit tracking nodes', x: 200, y: 180, s: 10, w: 140, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 700, y: 180, w: 160, h: 80, fill: '#1E293B', stroke: '#38BDF8' },
            { type: 'text', text: '📹 TRAFFIC CAM\nFlow & grid monitoring', x: 700, y: 180, s: 10, w: 140, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 200, y: 380, w: 160, h: 80, fill: '#1E293B', stroke: '#F59E0B' },
            { type: 'text', text: '🔋 SOLAR GRID\nUtility battery storage', x: 200, y: 380, s: 10, w: 140, f: '#F59E0B', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 700, y: 380, w: 160, h: 80, fill: '#1E293B', stroke: '#EF4444' },
            { type: 'text', text: '🚨 BROADCAST\nEmergency alerts system', x: 700, y: 380, s: 10, w: 140, f: '#EF4444', weight: 'bold' },
            { type: 'frame', shape: 'laptop', x: 450, y: 495, w: 220, h: 130, src: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600' }
        ],
        connections: [
            { from: 3, to: 1, color: '#38BDF8' },
            { from: 5, to: 1, color: '#38BDF8' },
            { from: 1, to: 7, color: '#F59E0B' },
            { from: 1, to: 9, color: '#EF4444' }
        ]
    },
    {
        id: 'humanoid_balance',
        name: 'Humanoid Balancing System',
        desc: '6-Axis IMU gyro signals feeding PID controllers for active ankle torque feedback loops.',
        category: 'Robotics', emoji: '🤖', thumbBg: 'linear-gradient(135deg, #374151, #111827)',
        w: 900, h: 600, bgColor: '#111827',
        elements: [
            { type: 'text', text: 'HUMANOID ACTIVE BALANCING FEEDBACK', x: 450, y: 65, s: 28, w: 600, f: '#F3F4F6', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 180, y: 220, w: 110, h: 110, fill: '#1F2937', stroke: '#F59E0B' },
            { type: 'text', text: '📟 IMU GYRO\n6-Axis Orientation', x: 180, y: 220, s: 10, w: 90, f: '#F59E0B', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 220, w: 180, h: 80, fill: '#1F2937', stroke: '#F59E0B', rx: 12, ry: 12 },
            { type: 'text', text: '🎛️ PID CALCULATOR\nTorque & power limits', x: 450, y: 220, s: 10, w: 160, f: '#F59E0B', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 720, y: 220, w: 110, h: 110, fill: '#1F2937', stroke: '#EF4444' },
            { type: 'text', text: '🦿 ANKLE SERVO\nActuator torque load', x: 720, y: 220, s: 10, w: 90, f: '#EF4444', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 380, w: 180, h: 80, fill: '#1F2937', stroke: '#10B981' },
            { type: 'text', text: '👣 GROUND CONTACT\nPhysical pressure feedback', x: 450, y: 380, s: 10, w: 160, f: '#10B981', weight: 'bold' },
            { type: 'frame', shape: 'phone', x: 450, y: 500, w: 150, h: 110, src: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#F59E0B' },
            { from: 3, to: 5, color: '#EF4444' },
            { from: 5, to: 7, color: '#10B981' },
            { from: 7, to: 1, color: '#38BDF8' }
        ]
    },
    {
        id: 'autonomous_submarine',
        name: 'UUV Submarine Autopilot',
        desc: 'Sequential point cloud mapping pipelines and A* routing planners for deep sea exploration.',
        category: 'Robotics', emoji: '⚓', thumbBg: 'linear-gradient(135deg, #1e3a8a, #172554)',
        w: 900, h: 600, bgColor: '#0B132B',
        elements: [
            { type: 'text', text: 'UUV AUTONOMOUS PIPELINE PROCESS', x: 450, y: 65, s: 28, w: 600, f: '#E2E8F0', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 150, y: 240, w: 160, h: 80, fill: '#1C2541', stroke: '#06B6D4', rx: 12, ry: 12 },
            { type: 'text', text: '📡 SONAR RADAR\nObstacle distances', x: 150, y: 240, s: 10, w: 140, f: '#06B6D4', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 350, y: 240, w: 160, h: 80, fill: '#1C2541', stroke: '#38BDF8', rx: 12, ry: 12 },
            { type: 'text', text: '🗺️ CLOUD MAPPER\n3D environment cloud', x: 350, y: 240, s: 10, w: 140, f: '#38BDF8', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 550, y: 240, w: 160, h: 80, fill: '#1C2541', stroke: '#6366F1', rx: 12, ry: 12 },
            { type: 'text', text: '🔀 PATH PLANNER\nA* route generation', x: 550, y: 240, s: 10, w: 140, f: '#6366F1', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 750, y: 240, w: 160, h: 80, fill: '#1C2541', stroke: '#10B981', rx: 12, ry: 12 },
            { type: 'text', text: '⚙️ THRUSTER PID\nPropeller force limits', x: 750, y: 240, s: 10, w: 140, f: '#10B981', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 400, h: 180, src: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#06B6D4' },
            { from: 3, to: 5, color: '#38BDF8' },
            { from: 5, to: 7, color: '#10B981' }
        ]
    },
    {
        id: 'fusion_reactor',
        name: 'Stellarator Plasma Controls',
        desc: 'Helical confinement magnetic coils converging on deuterium fusion core plasma chambers.',
        category: 'Infographics', emoji: '⚛️', thumbBg: 'linear-gradient(135deg, #581c87, #3b0764)',
        w: 900, h: 600, bgColor: '#1A0B2E',
        elements: [
            { type: 'text', text: 'STELLARATOR PLASMA CHAMBER CONFINEMENT', x: 450, y: 65, s: 26, w: 600, f: '#F5F3FF', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 200, y: 180, w: 120, h: 120, fill: '#2E1065', stroke: '#D946EF' },
            { type: 'text', text: '🧲 HELICAL COILS\nSuperconducting confinement', x: 200, y: 180, s: 10, w: 100, f: '#D946EF', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 200, y: 380, w: 120, h: 120, fill: '#2E1065', stroke: '#A855F7' },
            { type: 'text', text: '🛡️ HEAT DIVERTOR\nHigh-temp tungsten shield', x: 200, y: 380, s: 10, w: 100, f: '#A855F7', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 500, y: 280, w: 180, h: 180, fill: '#2E1065', stroke: '#F43F5E' },
            { type: 'text', text: '🔥 DEUTERIUM PLASMA\nConfinement chamber core', x: 500, y: 280, s: 11, w: 160, f: '#F43F5E', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 760, y: 280, w: 160, h: 80, fill: '#2E1065', stroke: '#3b82f6' },
            { type: 'text', text: '📈 FEEDBACK LOOP\nReal-time field limits', x: 760, y: 280, s: 10, w: 140, f: '#3b82f6', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 490, w: 280, h: 130, src: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=600' }
        ],
        connections: [
            { from: 1, to: 5, color: '#D946EF' },
            { from: 3, to: 5, color: '#A855F7' },
            { from: 5, to: 7, color: '#F43F5E' },
            { from: 7, to: 1, color: '#3b82f6' }
        ]
    },
    {
        id: 'ros2_navigation',
        name: 'ROS2 Nav2 Stack Node Map',
        desc: 'ROS2 topic node publisher-subscriber routing logs mapping lidar scans and costmaps.',
        category: 'Hardware Systems', emoji: '🛰️', thumbBg: 'linear-gradient(135deg, #1e293b, #334155)',
        w: 900, h: 600, bgColor: '#0F172A',
        elements: [
            { type: 'text', text: 'ROS2 NAV2 AUTONOMOUS NODE FLOW', x: 450, y: 65, s: 28, w: 600, f: '#F8FAFC', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 160, y: 200, w: 110, h: 110, fill: '#1E293B', stroke: '#0EA5E9' },
            { type: 'text', text: '🛰️ /lidar_node\nLaser scan distance logs', x: 160, y: 200, s: 10, w: 95, f: '#0EA5E9', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 160, y: 360, w: 110, h: 110, fill: '#1E293B', stroke: '#0EA5E9' },
            { type: 'text', text: '🎛️ /odometry_node\nMotor velocity feedback', x: 160, y: 360, s: 10, w: 95, f: '#0EA5E9', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 280, w: 180, h: 80, fill: '#1E293B', stroke: '#F59E0B', rx: 12, ry: 12 },
            { type: 'text', text: '🗺️ /amcl_localizer\nParticle filter localization', x: 450, y: 280, s: 10, w: 160, f: '#F59E0B', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 740, y: 280, w: 180, h: 80, fill: '#1E293B', stroke: '#10B981', rx: 12, ry: 12 },
            { type: 'text', text: '🧠 /bt_navigator\nBehavior tree action hub', x: 740, y: 280, s: 10, w: 160, f: '#10B981', weight: 'bold' },
            { type: 'frame', shape: 'laptop', x: 450, y: 475, w: 280, h: 130, src: 'https://images.unsplash.com/photo-1531747118685-ca8fa6e08806?w=600' }
        ],
        connections: [
            { from: 1, to: 5, color: '#0EA5E9' },
            { from: 3, to: 5, color: '#0EA5E9' },
            { from: 5, to: 7, color: '#F59E0B' }
        ]
    },
    {
        id: 'quantum_teleportation',
        name: 'Quantum Key Entanglement',
        desc: 'Secured Bell State measurement routing distributing EPR entangled photon qubits.',
        category: 'Infographics', emoji: '🌌', thumbBg: 'linear-gradient(135deg, #1e1b4b, #311042)',
        w: 900, h: 600, bgColor: '#0B0721',
        elements: [
            { type: 'text', text: 'QUANTUM KEY DISTRIBUTION PIPELINE', x: 450, y: 65, s: 28, w: 600, f: '#EEF2F6', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 180, y: 220, w: 110, h: 110, fill: '#1E1B4B', stroke: '#C084FC' },
            { type: 'text', text: '🌌 EPR LASER\nEntangled photon source', x: 180, y: 220, s: 10, w: 90, f: '#C084FC', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 220, w: 180, h: 80, fill: '#1E1B4B', stroke: '#C084FC', rx: 12, ry: 12 },
            { type: 'text', text: '📊 BELL MEASURE\nQuantum state diagnostics', x: 450, y: 220, s: 10, w: 160, f: '#C084FC', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 720, y: 220, w: 110, h: 110, fill: '#1E1B4B', stroke: '#E879F9' },
            { type: 'text', text: '🔑 BOB KEY\nDecrypted secure pad', x: 720, y: 220, s: 10, w: 90, f: '#E879F9', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 380, w: 180, h: 80, fill: '#1E1B4B', stroke: '#818CF8' },
            { type: 'text', text: '🎛️ COINCIDENCE COUNTER\nLaser timing correlation', x: 450, y: 380, s: 10, w: 160, f: '#818CF8', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 485, w: 280, h: 130, src: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#C084FC' },
            { from: 3, to: 5, color: '#E879F9' },
            { from: 5, to: 7, color: '#818CF8' },
            { from: 7, to: 1, color: '#A855F7' }
        ]
    },
    {
        id: 'rocket_telemetry',
        name: 'Avionics Rocket Telemetry',
        desc: 'Launch vehicle telemetry showing high-speed GPS log downlinks and IMU acceleration.',
        category: 'Hardware Systems', emoji: '🚀', thumbBg: 'linear-gradient(135deg, #18181b, #09090b)',
        w: 900, h: 600, bgColor: '#09090B',
        elements: [
            { type: 'text', text: 'LAUNCH VEHICLE REAL-TIME TELEMETRY', x: 450, y: 65, s: 28, w: 600, f: '#FAFAFA', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 220, y: 200, w: 160, h: 80, fill: '#18181B', stroke: '#F43F5E', rx: 12, ry: 12 },
            { type: 'text', text: '🌀 IMU ACCEL\nGravity acceleration vector', x: 220, y: 200, s: 10, w: 140, f: '#F43F5E', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 220, y: 340, w: 160, h: 80, fill: '#18181B', stroke: '#F43F5E', rx: 12, ry: 12 },
            { type: 'text', text: '🛰️ GPS LOGS\nCoordinate tracking latency', x: 220, y: 340, s: 10, w: 140, f: '#F43F5E', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 680, y: 200, w: 160, h: 80, fill: '#18181B', stroke: '#FDA4AF', rx: 12, ry: 12 },
            { type: 'text', text: '📡 S-BAND BEACON\nDownlink telemetry signal', x: 680, y: 200, s: 10, w: 140, f: '#FDA4AF', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 680, y: 340, w: 160, h: 80, fill: '#18181B', stroke: '#FDA4AF', rx: 12, ry: 12 },
            { type: 'text', text: '💾 RECEIVER TANK\nBase telemetry station', x: 680, y: 340, s: 10, w: 140, f: '#FDA4AF', weight: 'bold' },
            { type: 'frame', shape: 'phone', x: 450, y: 285, w: 170, h: 250, src: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=600' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 485, w: 170, h: 40, fill: '#022C22', stroke: '#10B981' },
            { type: 'text', text: '🟢 ACTIVE SYSTEM', x: 450, y: 485, s: 10, w: 150, f: '#10B981', weight: 'bold' }
        ],
        connections: [
            { from: 1, to: 9, color: '#F43F5E' },
            { from: 3, to: 9, color: '#F43F5E' },
            { from: 9, to: 5, color: '#FDA4AF' },
            { from: 9, to: 7, color: '#FDA4AF' }
        ]
    },
    {
        id: 'exotic_cyber_hand',
        name: 'Cybernetic Haptic Hand',
        desc: 'Advanced robotic hand blueprint mapping tactile glove sensors to bionic tension actuators.',
        category: 'Robotics', emoji: '🦾', thumbBg: 'linear-gradient(135deg, #1f2937, #374151)',
        w: 900, h: 600, bgColor: '#111827',
        elements: [
            { type: 'text', text: 'CYBERNETIC BIONIC HAPTIC CONTROL LOOP', x: 450, y: 65, s: 26, w: 600, f: '#F9FAFB', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 200, y: 220, w: 110, h: 110, fill: '#1F2937', stroke: '#10B981' },
            { type: 'text', text: '🧤 FLEX GLOVE\nResistance glove sensor', x: 200, y: 220, s: 10, w: 90, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 220, w: 180, h: 80, fill: '#1F2937', stroke: '#10B981', rx: 12, ry: 12 },
            { type: 'text', text: '🦾 BIONIC SERVOS\nTension joint drivers', x: 450, y: 220, s: 10, w: 160, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'circle', x: 700, y: 220, w: 110, h: 110, fill: '#1F2937', stroke: '#34D399' },
            { type: 'text', text: '📈 JOINT ANGLE\nActive angle feedback', x: 700, y: 220, s: 10, w: 90, f: '#34D399', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 450, y: 380, w: 180, h: 80, fill: '#1F2937', stroke: '#34D399', rx: 12, ry: 12 },
            { type: 'text', text: '🔔 PRESSURE SENSE\nHaptic tactile transducer', x: 450, y: 380, s: 10, w: 160, f: '#34D399', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 200, y: 440, w: 140, h: 180, src: 'https://images.unsplash.com/photo-1589254065878-42c9da997008?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#10B981' },
            { from: 3, to: 5, color: '#34D399' },
            { from: 5, to: 7, color: '#059669' },
            { from: 7, to: 1, color: '#047857' }
        ]
    },
    {
        id: 'ai_protein_folding',
        name: 'AI Protein Sequence Folder',
        desc: 'Deep transformer neural networks calculating residue coordinates and alignments.',
        category: 'Infographics', emoji: '🧬', thumbBg: 'linear-gradient(135deg, #064e3b, #022c22)',
        w: 900, h: 600, bgColor: '#022C22',
        elements: [
            { type: 'text', text: 'BIO-AI PROTEIN TRANSFORMATION FOLDING', x: 450, y: 65, s: 26, w: 600, f: '#ECFDF5', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 240, y: 220, w: 200, h: 90, fill: '#064E3B', stroke: '#10B981', rx: 12, ry: 12 },
            { type: 'text', text: '🧬 MULTI-ALIGNMENT BLOCK\nResidue covariation patterns', x: 240, y: 220, s: 10, w: 180, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 220, w: 200, h: 90, fill: '#064E3B', stroke: '#A7F3D0', rx: 12, ry: 12 },
            { type: 'text', text: '📐 3D RESIDUE PREDICTOR\nSpatial atomic coordinate matrices', x: 640, y: 220, s: 10, w: 180, f: '#A7F3D0', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1532187643603-ba119ca4109e?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#10B981' }
        ]
    },
    {
        id: 'industry_4_digital_twin',
        name: 'Industrial Digital Twin Platform',
        desc: 'Sleek presentation deck mapping physical edge sensors to virtual Kubernetes gateways.',
        category: 'Slides', emoji: '🏭', thumbBg: 'linear-gradient(135deg, #134e5e, #71b280)',
        w: 900, h: 600, bgColor: '#06282E',
        elements: [
            { type: 'text', text: 'INDUSTRIAL TWIN ORCHESTRATION LAYER', x: 450, y: 65, s: 28, w: 600, f: '#E0F2FE', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 240, y: 220, w: 200, h: 90, fill: '#0F3C43', stroke: '#06B6D4', rx: 12, ry: 12 },
            { type: 'text', text: '🌡️ EDGE GATEWAY SENSORS\nIndustrial telemetry relays active', x: 240, y: 220, s: 10, w: 180, f: '#06B6D4', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 220, w: 200, h: 90, fill: '#0F3C43', stroke: '#22D3EE', rx: 12, ry: 12 },
            { type: 'text', text: '☁️ KUBERNETES MICROSERVICES\nSimulated virtual sensor twinning', x: 640, y: 220, s: 10, w: 180, f: '#22D3EE', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#06B6D4' }
        ]
    },
    {
        id: 'bms_thermal_runaway',
        name: 'EV Battery BMS Liquid-Cooling',
        desc: 'High-voltage battery safety architecture graphing sensor grids to pump controllers.',
        category: 'Hardware Systems', emoji: '🔋', thumbBg: 'linear-gradient(135deg, #022c22, #064e3b)',
        w: 900, h: 600, bgColor: '#022C22',
        elements: [
            { type: 'text', text: 'BATTERY THERMAL CONTROL SYSTEM', x: 450, y: 65, s: 28, w: 600, f: '#F0FDF4', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 240, y: 220, w: 200, h: 90, fill: '#064E3B', stroke: '#10B981', rx: 12, ry: 12 },
            { type: 'text', text: '🌡️ TEMPERATURE MATRIX\nHigh-density thermistor nodes active', x: 240, y: 220, s: 10, w: 180, f: '#10B981', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 220, w: 200, h: 90, fill: '#064E3B', stroke: '#34D399', rx: 12, ry: 12 },
            { type: 'text', text: '🌀 LIQUID COOLANT VALVE\nProportional flow coolant cooling', x: 640, y: 220, s: 10, w: 180, f: '#34D399', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1563770660941-20978e870e26?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#10B981' }
        ]
    },
    {
        id: 'space_telescope_optical',
        name: 'Space Telescope Mirror Optics',
        desc: 'Spectacular space telescope schematic mapping primary hex mirrors to central cameras.',
        category: 'Infographics', emoji: '🔭', thumbBg: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
        w: 900, h: 600, bgColor: '#060B18',
        elements: [
            { type: 'text', text: 'HEX TELESCOPE MIRROR LIGHT PATH', x: 450, y: 65, s: 28, w: 600, f: '#F8FAFC', st: 'zoom', d: 0.1, weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 240, y: 220, w: 200, h: 90, fill: '#0F172A', stroke: '#EAB308', rx: 12, ry: 12 },
            { type: 'text', text: '🍯 PRIMARY HEX REFLECTORS\n18-segment gold plated mirrors', x: 240, y: 220, s: 10, w: 180, f: '#EAB308', weight: 'bold' },
            { type: 'shape', shape: 'rounded_rect', x: 640, y: 220, w: 200, h: 90, fill: '#0F172A', stroke: '#F59E0B', rx: 12, ry: 12 },
            { type: 'text', text: '📸 FOCAL SENSOR ASSEMBLY\nNear-infrared camera filters', x: 640, y: 220, s: 10, w: 180, f: '#F59E0B', weight: 'bold' },
            { type: 'frame', shape: 'rectangle', x: 450, y: 440, w: 340, h: 220, src: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600' }
        ],
        connections: [
            { from: 1, to: 3, color: '#EAB308' }
        ]
    }
];

let currentTemplateCat = 'all';
let currentTemplateSearch = '';

function initTemplates() {
    const modal = document.getElementById('templates_modal');
    const searchInput = document.getElementById('template_search_input');
    const clearSearchBtn = document.getElementById('btn_clear_template_search');
    const closeModalBtn = document.getElementById('close_templates_modal');
    
    if (closeModalBtn) {
        closeModalBtn.onclick = closeTemplatesModal;
    }
    
    // Close on overlay background click
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeTemplatesModal();
        };
    }
    
    if (searchInput) {
        searchInput.oninput = (e) => {
            currentTemplateSearch = e.target.value;
            if (clearSearchBtn) {
                clearSearchBtn.style.display = currentTemplateSearch ? 'block' : 'none';
            }
            renderModalTemplates();
        };
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.onclick = () => {
            searchInput.value = '';
            currentTemplateSearch = '';
            clearSearchBtn.style.display = 'none';
            renderModalTemplates();
        };
    }
    
    // Bind category filter pills
    document.querySelectorAll('.template-cat-pill').forEach(pill => {
        pill.onclick = () => {
            document.querySelectorAll('.template-cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentTemplateCat = pill.dataset.cat;
            renderModalTemplates();
        };
    });
}

function renderModalTemplates() {
    const grid = document.getElementById('modal_templates_grid');
    const emptyState = document.getElementById('template_search_empty');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // Filter templates
    const filtered = CUSTOM_TEMPLATES.filter(tpl => {
        // Category check
        const matchesCat = (currentTemplateCat === 'all' || tpl.category === currentTemplateCat);
        
        // Search query check
        const q = currentTemplateSearch.toLowerCase().trim();
        const matchesSearch = !q || 
            tpl.name.toLowerCase().includes(q) || 
            tpl.desc.toLowerCase().includes(q) || 
            tpl.category.toLowerCase().includes(q);
            
        return matchesCat && matchesSearch;
    });
    
    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        grid.style.display = 'none';
    } else {
        emptyState.classList.add('hidden');
        grid.style.display = 'grid';
        
        filtered.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.style.height = 'auto'; // allow natural height
            card.innerHTML = `
                <div class="template-thumb" style="background: ${tpl.thumbBg}; height: 160px; font-size: 3.5rem;">
                    <span>${tpl.emoji}</span>
                    <span class="template-tag">${tpl.category}</span>
                    <span class="template-resolution"><i class="fa-solid fa-expand"></i> ${tpl.w || 900} x ${tpl.h || 600}</span>
                </div>
                <div class="template-info" style="padding: 20px;">
                    <h4 class="template-title" style="font-size: 1.05rem; font-family: 'Orbitron', sans-serif; margin-bottom: 8px; color: var(--primary-gold);">${tpl.name}</h4>
                    <p class="template-desc" style="font-size: 0.78rem; opacity: 0.8; height: 38px; line-height: 1.4; margin-bottom: 15px; -webkit-line-clamp: 2;">${tpl.desc}</p>
                    <button class="template-load-btn" data-tpl="${tpl.id}" style="padding: 10px; font-family: 'Orbitron', sans-serif; letter-spacing: 0.5px; border-radius: 8px;">Load Template</button>
                </div>
            `;
            
            const loadBtn = card.querySelector('.template-load-btn');
            const triggerLoad = (e) => {
                if (e) e.stopPropagation();
                if (confirm(`Are you sure you want to load "${tpl.name}"? This will clear your current canvas.`)) {
                    loadCustomTemplate(tpl.id);
                    closeTemplatesModal();
                }
            };
            
            loadBtn.onclick = triggerLoad;
            card.onclick = triggerLoad;
            
            grid.appendChild(card);
        });
    }
}

function openTemplatesModal() {
    const modal = document.getElementById('templates_modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    
    // Clear search and reset categories on open
    document.getElementById('template_search_input').value = '';
    document.getElementById('btn_clear_template_search').style.display = 'none';
    currentTemplateCat = 'all';
    currentTemplateSearch = '';
    
    // Reset category tabs visual active class
    document.querySelectorAll('.template-cat-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.cat === 'all');
    });
    
    renderModalTemplates();

    if (isMobile) {
        history.pushState({ modal: 'templates' }, '');
    }
}

function closeTemplatesModal(viaPopstate = false) {
    const modal = document.getElementById('templates_modal');
    if (modal) modal.classList.add('hidden');
    if (!viaPopstate && isMobile) {
        history.back();
    }
}

function openAIModal() {
    const modal = document.getElementById('ai_modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('ai_prompt').focus();
        if (isMobile) {
            history.pushState({ modal: 'ai' }, '');
        }
    }
}

function closeAIModal(viaPopstate = false) {
    const modal = document.getElementById('ai_modal');
    if (modal) modal.classList.add('hidden');
    if (!viaPopstate && isMobile) {
        history.back();
    }
}

function loadCustomTemplate(templateId) {
    isHistoryAction = true; // Block intermediate history commits
    showToast("🎨 Loading premium template layout...");
    
    canvas.clear();
    connections = [];
    
    // Find template in registry
    const tpl = CUSTOM_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) {
        showToast("❌ Template not found!");
        isHistoryAction = false;
        return;
    }
    
    const targetW = tpl.w || 900;
    const targetH = tpl.h || 600;
    
    virtualFormat.w = targetW;
    virtualFormat.h = targetH;
    localStorage.setItem('prismax_ratio', JSON.stringify(virtualFormat));
    resizeCanvas(false);
    
    // Set background color
    canvas.backgroundColor = tpl.bgColor || '#FAF6F0';
    canvas.setBackgroundColor(canvas.backgroundColor, canvas.renderAll.bind(canvas));
    
    try {
        renderDataTemplate(tpl);
    } catch(err) {
        console.error("Template Render Error:", err);
    }
    
    // Allow small timeout for image seed frames to start rendering before history snapshot
    setTimeout(() => {
        isHistoryAction = false;
        if (canvas.backgroundColor) {
            canvas.setBackgroundColor(canvas.backgroundColor, canvas.renderAll.bind(canvas));
        }
        saveHistory();
        canvas.requestRenderAll();
        updatePropsPanel();
        showToast("✨ Template loaded successfully!");
    }, 450);
}

function renderDataTemplate(tpl) {
    const spawnedObjects = [];
    const targetW = tpl.w || 900;
    const targetH = tpl.h || 600;
    const isDark = tpl.bgColor !== '#FAF6F0' && tpl.bgColor !== '#F9FAFB' && tpl.bgColor !== '#FFFDF9' && tpl.bgColor !== '#FFFBEB' && tpl.bgColor !== '#F8FAFC';
    
    // 1. Subtle High-Tech Blueprint Dot Grid (gorgeous sci-fi visual detail!)
    if (tpl.category === 'Robotics' || tpl.category === 'Infographics' || tpl.category === 'Hardware Systems') {
        const dotDist = 60;
        const gridCol = isDark ? 'rgba(6, 182, 212, 0.12)' : 'rgba(30, 41, 59, 0.08)';
        
        for (let gx = dotDist; gx < targetW; gx += dotDist) {
            for (let gy = dotDist; gy < targetH; gy += dotDist) {
                const dot = new fabric.Circle({
                    left: gx,
                    top: gy,
                    radius: 1.5,
                    fill: gridCol,
                    selectable: false,
                    evented: false,
                    id: 'blueprint_dot'
                });
                canvas.add(dot);
                canvas.sendToBack(dot);
            }
        }
    }
    
    // 2. Corner brackets for premium industrial presentation board HUD feel!
    const bracketSize = 25;
    const bracketCol = isDark ? '#D4AF37' : '#1E293B';
    const offsets = [
        { x: 30, y: 30, xSign: 1, ySign: 1 },
        { x: targetW - 30, y: 30, xSign: -1, ySign: 1 },
        { x: 30, y: targetH - 30, xSign: 1, ySign: -1 },
        { x: targetW - 30, y: targetH - 30, xSign: -1, ySign: -1 }
    ];
    offsets.forEach(offset => {
        const hLine = new fabric.Line([offset.x, offset.y, offset.x + (bracketSize * offset.xSign), offset.y], {
            stroke: bracketCol, strokeWidth: 2, selectable: false, evented: false, id: 'hud_corner'
        });
        const vLine = new fabric.Line([offset.x, offset.y, offset.x, offset.y + (bracketSize * offset.ySign)], {
            stroke: bracketCol, strokeWidth: 2, selectable: false, evented: false, id: 'hud_corner'
        });
        canvas.add(hLine);
        canvas.add(vLine);
    });
    
    // 3. Automatically add a gorgeous outer enclosing frame
    const hasOuterBorder = tpl.elements.some(el => el.type === 'shape' && el.shape === 'rect' && el.w > targetW * 0.8 && el.h > targetH * 0.8);
    if (!hasOuterBorder) {
        const borderCol = isDark ? '#D4AF37' : '#1E293B';
        createShapeForTemplate('rect', targetW / 2, targetH / 2, targetW - 40, targetH - 40, 'transparent', {
            stroke: borderCol,
            strokeWidth: 2.5,
            customAnimStyle: 'zoom',
            customAnimDelay: 0.05
        });
    }
    
    const isFlowchart = tpl.elements.some(el => el.type === 'shape') && tpl.connections && tpl.connections.length > 0;
    
    // 4. Spawn elements with dynamic, vibrant color injection
    tpl.elements.forEach((el, index) => {
        let spawned = null;
        
        // Color Enhancer logic to make everything colorful, eye-pleasing & premium!
        let strokeCol = el.stroke;
        let fillCol = el.fill;
        let textCol = el.f;
        
        if (el.type === 'shape') {
            if (tpl.category === 'Robotics') {
                if (!el.stroke || el.stroke === '#D4AF37' || el.stroke === '#1E293B' || el.stroke === '#64748B' || el.stroke === '#06B6D4' || el.stroke === '#34D399') {
                    const roboticsColors = ['#00F3FF', '#39FF14', '#FF007F', '#FFD700', '#8B00FF', '#FF5F00'];
                    strokeCol = roboticsColors[index % roboticsColors.length];
                }
                if (el.fill === '#1E293B' || el.fill === '#0F172A' || !el.fill || el.fill === 'transparent' || el.fill === '#022C22' || el.fill === '#031514') {
                    fillCol = 'rgba(15, 23, 42, 0.7)';
                }
            } else if (tpl.category === 'Infographics' || tpl.category === 'Hardware Systems') {
                if (!el.stroke || el.stroke === '#2563EB' || el.stroke === '#D4AF37' || el.stroke === '#1E293B') {
                    const techColors = ['#00F3FF', '#FF5F00', '#39FF14', '#FFD700', '#EAB308'];
                    strokeCol = techColors[index % techColors.length];
                }
                if (el.fill === '#EFF6FF' || el.fill === '#F0FDF4' || el.fill === '#1E293B' || el.fill === 'transparent' || !el.fill) {
                    if (strokeCol === '#00F3FF') fillCol = 'rgba(0, 243, 255, 0.12)';
                    else if (strokeCol === '#FF5F00') fillCol = 'rgba(255, 95, 0, 0.12)';
                    else if (strokeCol === '#39FF14') fillCol = 'rgba(57, 255, 20, 0.12)';
                    else if (strokeCol === '#FFD700') fillCol = 'rgba(255, 215, 0, 0.12)';
                    else fillCol = 'rgba(234, 179, 8, 0.12)';
                }
            } else if (tpl.category === 'Marketing') {
                if (!el.stroke || el.stroke === '#E11D48' || el.stroke === '#BE123C') {
                    const mktColors = ['#FF007F', '#FF5F00', '#E11D48', '#FF0055'];
                    strokeCol = mktColors[index % mktColors.length];
                }
                if (el.fill === '#FFF5F5' || el.fill === '#FFF1F2' || !el.fill) {
                    fillCol = '#FFF5F7';
                }
            }
        } else if (el.type === 'text') {
            textCol = el.f || '#1E293B';
            if (tpl.category === 'Robotics') {
                if (textCol === '#D4AF37' || textCol === '#94A3B8' || textCol === '#1E293B' || textCol === '#06B6D4' || textCol === '#34D399' || textCol === '#E2E8F0') {
                    const roboticsTexts = ['#00F3FF', '#FFD700', '#39FF14', '#FF007F', '#00F3FF', '#FF5F00'];
                    textCol = roboticsTexts[index % roboticsTexts.length];
                }
            } else if (tpl.category === 'Infographics' || tpl.category === 'Hardware Systems') {
                if (textCol === '#1E293B' || textCol === '#64748B' || textCol === '#1E40AF' || textCol === '#34D399' || textCol === '#E2E8F0' || textCol === '#2563EB') {
                    const techTexts = ['#00F3FF', '#FF5F00', '#39FF14', '#FFD700', '#E2E8F0'];
                    textCol = techTexts[index % techTexts.length];
                }
            } else if (tpl.category === 'Marketing') {
                if (textCol === '#E11D48' || textCol === '#BE123C' || textCol === '#4C0519' || textCol === '#9F1239') {
                    const mktTexts = ['#E11D48', '#C90050', '#BE123C', '#9F1239'];
                    textCol = mktTexts[index % mktTexts.length];
                }
            }
        }
        
        if (el.type === 'text') {
            spawned = createTextForTemplate(el.text, el.x, el.y, {
                fontSize: el.s || 18,
                fontWeight: el.weight || (el.s > 24 ? 'bold' : 'normal'),
                fill: textCol,
                textAlign: el.align || 'center',
                width: el.w || 300,
                customAnimStyle: el.st || 'default',
                customAnimDelay: el.d || 0,
                fontFamily: el.fontFamily
            });
        } else if (el.type === 'shape') {
            spawned = createShapeForTemplate(el.shape, el.x, el.y, el.w, el.h, fillCol, {
                stroke: strokeCol,
                strokeWidth: el.strokeWidth || 2.5,
                rx: el.rx || 0,
                ry: el.ry || 0,
                customAnimStyle: el.st || 'default',
                customAnimDelay: el.d || 0
            });
        } else if (el.type === 'frame') {
            spawned = createFrameForTemplate(el.shape, el.x, el.y, el.w, el.h, el.src);
        }
        
        spawnedObjects.push(spawned);
    });
    
    // 5. Spawn connections
    if (tpl.connections && Array.isArray(tpl.connections)) {
        setTimeout(() => {
            tpl.connections.forEach(conn => {
                const fromNode = spawnedObjects[conn.from];
                const toNode = spawnedObjects[conn.to];
                if (fromNode && toNode) {
                    connectNodesForTemplate(fromNode, toNode, conn.color || '#D4AF37');
                }
            });
        }, 150);
    }

    // 6. Spawn a premium, highly visible EDITABLE sample instruction text box
    // so users immediately know exactly how to customize templates.
    const sampleText = new fabric.Textbox("💡 Double-tap any text box to edit/customize!", {
        left: targetW / 2,
        top: targetH - 50,
        originX: 'center',
        originY: 'center',
        fontSize: 14,
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 'bold',
        fill: isDark ? '#D4AF37' : '#9a3412',
        textAlign: 'center',
        width: Math.min(500, targetW - 60),
        borderColor: '#D4AF37',
        editingBorderColor: '#D4AF37',
        cornerColor: '#D4AF37',
        cornerStyle: 'circle',
        cornerSize: isMobile ? 24 : 12,
        transparentCorners: false,
        padding: 8,
        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)',
        rx: 8,
        ry: 8,
        editable: false
    });
    canvas.add(sampleText);
    canvas.setActiveObject(sampleText);
}

// Helpers to programmatically construct styled Fabric.js template elements
function createTextForTemplate(textStr, x, y, options = {}) {
    const text = new fabric.Textbox(textStr, {
        left: x,
        top: y,
        originX: options.originX || 'center',
        originY: options.originY || 'center',
        fontSize: options.fontSize || 18,
        fontFamily: options.fontFamily || "'Montserrat', sans-serif",
        fontWeight: options.fontWeight || 'normal',
        fill: options.fill || '#1E293B',
        textAlign: options.textAlign || 'center',
        width: options.width || 300,
        customAnimStyle: options.customAnimStyle || 'default',
        customAnimDelay: options.customAnimDelay || 0,
        shadow: options.fontSize > 16 ? new fabric.Shadow({
            color: 'rgba(0, 0, 0, 0.3)',
            blur: 6,
            offsetX: 2,
            offsetY: 2
        }) : null,
        id: 'text_' + Date.now() + Math.random(),
        editable: false
    });
    canvas.add(text);
    return text;
}

function createShapeForTemplate(shapeType, x, y, w, h, fill, options = {}) {
    let fillShape;
    const col = '#1E293B';
    const fillOpts = {
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        fill: fill || 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
        width: w,
        height: h
    };
    
    if (shapeType === 'circle') {
        fillShape = new fabric.Ellipse({
            ...fillOpts,
            rx: w / 2,
            ry: h / 2
        });
    } else if (shapeType === 'diamond') {
        const pts = [
            { x: 0, y: -h/2 },
            { x: w/2, y: 0 },
            { x: 0, y: h/2 },
            { x: -w/2, y: 0 }
        ];
        fillShape = new fabric.Polygon(pts, fillOpts);
    } else if (shapeType === 'rounded_rect') {
        fillShape = new fabric.Rect({
            ...fillOpts,
            rx: 15,
            ry: 15
        });
    } else if (shapeType === 'triangle') {
        fillShape = new fabric.Triangle(fillOpts);
    } else { // rect
        fillShape = new fabric.Rect(fillOpts);
    }
    
    let sketchyPathStr = '';
    if (shapeType === 'circle') {
        sketchyPathStr = getSketchyEllipsePath(w, h);
    } else if (shapeType === 'diamond') {
        sketchyPathStr = getSketchyDiamondPath(w, h);
    } else if (shapeType === 'rounded_rect') {
        sketchyPathStr = getSketchyRectPath(w, h, 15);
    } else if (shapeType === 'triangle') {
        const pts = [
            { x: 0, y: -h/2 },
            { x: w/2, y: h/2 },
            { x: -w/2, y: h/2 }
        ];
        sketchyPathStr = getSketchyPolygonPath(pts);
    } else { // rect
        sketchyPathStr = getSketchyRectPath(w, h, 0);
    }
    
    const outlinePath = new fabric.Path(sketchyPathStr, {
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        fill: 'transparent',
        stroke: options.stroke || col,
        strokeWidth: options.strokeWidth !== undefined ? options.strokeWidth : 2.5,
        objectCaching: false
    });
    
    const shapeGroup = new fabric.Group([fillShape, outlinePath], {
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        id: options.id || ('shape_' + Date.now() + Math.random()),
        selectable: true,
        hasControls: true,
        customAnimStyle: options.customAnimStyle || 'default',
        customAnimDelay: options.customAnimDelay || 0,
        shadow: new fabric.Shadow({
            color: 'rgba(0, 0, 0, 0.45)',
            blur: 15,
            offsetX: 6,
            offsetY: 8
        })
    });
    
    shapeGroup.originalShapeType = shapeType;
    
    canvas.add(shapeGroup);
    return shapeGroup;
}

function createFrameForTemplate(frameType, x, y, w, h, imgSrc) {
    const col = '#D4AF37';
    const cameraIcon = new fabric.Text('📷', {
        left: 0, top: -15, originX: 'center', originY: 'center', fontSize: 34, fill: col, opacity: 0.65, visible: false
    });
    const placeholderText = new fabric.Text('Click to Upload\nImage', {
        left: 0, top: 25, originX: 'center', originY: 'center', fontSize: 12, fill: col, opacity: 0.5, textAlign: 'center', visible: false
    });
    
    const { fillShape, clipShape, outlinePathStr } = getFrameGeometries(frameType, w, h);
    
    const outlinePath = new fabric.Path(outlinePathStr, {
        left: 0, top: 0, originX: 'center', originY: 'center', fill: 'transparent', stroke: col, strokeWidth: 2.5, objectCaching: false
    });
    
    fillShape.set('fill', 'transparent'); // Instantly transparent!
    
    const frameGroup = new fabric.Group([fillShape, cameraIcon, placeholderText, outlinePath], {
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        id: 'frame_' + Date.now() + Math.random(),
        isFrame: true,
        frameShapeType: frameType,
        frameWidth: w,
        frameHeight: h,
        fillShape: fillShape,
        clipShape: clipShape,
        outlinePath: outlinePath,
        cameraIcon: cameraIcon,
        placeholderText: placeholderText,
        hasControls: true,
        selectable: true,
        shadow: new fabric.Shadow({
            color: 'rgba(0, 0, 0, 0.35)',
            blur: 15,
            offsetX: 6,
            offsetY: 8
        })
    });
    
    canvas.add(frameGroup);
    
    if (imgSrc) {
        fabric.Image.fromURL(imgSrc, (img) => {
            if (img) {
                insertImageIntoFrame(frameGroup, img, imgSrc);
            }
        }, { crossOrigin: 'anonymous' });
    }
    return frameGroup;
}

function connectNodesForTemplate(fromNode, toNode, color = '#D4AF37') {
    drawConnection(fromNode, toNode);
    const conn = connections[connections.length - 1];
    if (conn) {
        conn.color = color;
        const objects = canvas.getObjects();
        const line = objects.find(o => o.connId === conn.lineId && o.isArrowLine);
        const head = objects.find(o => o.connId === conn.lineId && o.isArrowHead);
        if (line) line.set('stroke', color);
        if (head) head.set({ stroke: color, fill: color });
    }
}

function buildTemplateLayout(templateId) {
    // Keep backwards compatibility or manual invocation if needed, but everything is handled by data-driven renderDataTemplate now!
}

