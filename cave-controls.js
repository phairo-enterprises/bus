// Complete recovered historical controls; shell owns launch/pause.
(() => {
try {
const scene = new THREE.Scene();
        const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('nexus-canvas'), antialias: true });
        const BASE_FOV = 75;
        let selectedFov = BASE_FOV;
        const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
        const clock = new THREE.Clock(false);
        let frame = null;
        let pageSuspended = false;
        const isActive = () => document.body.classList.contains('launched') && !document.hidden && !pageSuspended;
        
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        // The existing shell owns the one canvas.
        camera.rotation.order = 'YXZ';

        const cameraRig = new THREE.Group();
        scene.add(cameraRig);
        cameraRig.add(camera);

        const artifactGroup = new THREE.Group();
        artifactGroup.scale.setScalar(0.8);
        scene.add(artifactGroup);

        const hudGroup = new THREE.Group();
        camera.add(hudGroup);
        hudGroup.position.set(0, 0, -5);

        const bobControls = new THREE.Group();
        hudGroup.add(bobControls);

        const freecamControls = new THREE.Group();
        hudGroup.add(freecamControls);
        freecamControls.visible = false;
        
        let advancedProtocolsLoaded = false;
        let cameraMode = 'bob';
        let FREECAM_SPEED = 5.0;
        let SENSITIVITY_LOOK = 0.002;
        let artifacts = [];
        let targetArtifactIndex = 0;
        const targetQuaternion = new THREE.Quaternion();
        let swipeHandle;

        const CAROUSEL_RADIUS = 4;
        const ANGLE_STEP = Math.PI / 5;

        const colorPalette = {
            neutral: new THREE.Color(0x555555),
            mode: new THREE.Color(0x303060),
            parameter: new THREE.Color(0x603030),
            confirm: new THREE.Color(0x306030)
        };

        const ambientLight = new THREE.AmbientLight(0x404080, 2);
        scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0xFF0000, 1.5, 50);
        artifactGroup.add(pointLight);

        const caveGeometry = new THREE.BufferGeometry();
        const caveVertices = [];
        const radius = 20, depth = 50, segments = 12;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            caveVertices.push(Math.cos(angle)*radius*(1+Math.random()*0.2), Math.sin(angle)*radius*(1+Math.random()*0.2), -depth/2 + (Math.random()-0.5)*5);
            caveVertices.push(Math.cos(angle)*radius*(1+Math.random()*0.2), Math.sin(angle)*radius*(1+Math.random()*0.2), depth/2 + (Math.random()-0.5)*5);
        }
        caveVertices.push(0, 0, depth / 2);
        const backCenterIndex = caveVertices.length / 3 - 1;
        const caveIndices = [];
        for (let i = 0; i < segments; i++) {
            const current = i * 2;
            const next = ((i + 1) % segments) * 2;
            caveIndices.push(current, current + 1, next);
            caveIndices.push(next, current + 1, next + 1);
            caveIndices.push(next + 1, current + 1, backCenterIndex);
        }
        caveGeometry.setIndex(caveIndices);
        caveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(caveVertices, 3));
        caveGeometry.computeVertexNormals();
        const caveMaterial = new THREE.MeshStandardMaterial({ color: 0x223366, flatShading: true, side: THREE.FrontSide });
        const cave = new THREE.Mesh(caveGeometry, caveMaterial);
        scene.add(cave);
        
        function createCube() {
            const group = new THREE.Group();
            const material = new THREE.MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0.1, depthWrite: false });
            material.userData.baseOpacity = 0.1;
            const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
            group.add(body);
            const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 }));
            wireframe.material.userData.baseOpacity = 0.5;
            group.add(wireframe);
            return group;
        }

        function createSphere() {
            const group = new THREE.Group();
            const material = new THREE.MeshBasicMaterial({ color: 0x00FF00, transparent: true, opacity: 0.1, depthWrite: false });
            material.userData.baseOpacity = 0.1;
            const body = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 16), material);
            group.add(body);
            return group;
        }

        function createPyramid() {
            const group = new THREE.Group();
            const material = new THREE.MeshBasicMaterial({ color: 0x0000FF, transparent: true, opacity: 0.1, depthWrite: false });
            material.userData.baseOpacity = 0.1;
            const body = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.5, 4), material);
            group.add(body);
            const wireframe = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 }));
            wireframe.material.userData.baseOpacity = 0.5;
            group.add(wireframe);
            return group;
        }
        
        function createHypercube() {
            const group = new THREE.Group();
            const vertices4D = [];
            for (let i = 0; i < 16; i++) {
                vertices4D.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
            }
            const projectedVertices = [];
            const distance = 2;
            const scale = 1.5;
            vertices4D.forEach(v => {
                const w = v[3];
                const perspective = 1 / (distance - w);
                projectedVertices.push(new THREE.Vector3(v[0] * perspective, v[1] * perspective, v[2] * perspective).multiplyScalar(scale));
            });
            const edges = [];
            for (let i = 0; i < 16; i++) {
                for (let j = i + 1; j < 16; j++) {
                    let diffs = 0;
                    if (vertices4D[i][0] !== vertices4D[j][0]) diffs++;
                    if (vertices4D[i][1] !== vertices4D[j][1]) diffs++;
                    if (vertices4D[i][2] !== vertices4D[j][2]) diffs++;
                    if (vertices4D[i][3] !== vertices4D[j][3]) diffs++;
                    if (diffs === 1) { edges.push(i, j); }
                }
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(projectedVertices);
            geometry.setIndex(edges);
            const material = new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
            material.userData.baseOpacity = 0.5;
            const hypercube = new THREE.LineSegments(geometry, material);
            const invisibleBodyMaterial = new THREE.MeshBasicMaterial({ visible: false });
            invisibleBodyMaterial.userData = { baseOpacity: 0.0 };
            const invisibleBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), invisibleBodyMaterial);
            group.add(invisibleBody);
            group.add(hypercube);
            return group;
        }
        
        const shapeCatalog = [
            { name: 'Cube', generator: createCube },
            { name: 'Sphere', generator: createSphere },
            { name: 'Pyramid', generator: createPyramid },
            { name: 'Hypercube', generator: createHypercube }
        ];

        function createArtifacts() {
            const totalAngle = (shapeCatalog.length - 1) * ANGLE_STEP;
            const startAngle = -totalAngle / 2;
            shapeCatalog.forEach((shapeDef, index) => {
                const artifact = shapeDef.generator();
                artifact.name = shapeDef.name;
                const angle = startAngle + index * ANGLE_STEP;
                artifact.position.set(CAROUSEL_RADIUS * Math.sin(angle), 0, -CAROUSEL_RADIUS + CAROUSEL_RADIUS * Math.cos(angle));
                artifact.visible = true;
                artifactGroup.add(artifact);
                artifacts.push(artifact);
            });
        }
        createArtifacts();

        function createButton(name, labelText, position, size, targetGroup, color = colorPalette.neutral) {
            const buttonGroup = new THREE.Group();
            buttonGroup.position.copy(position);
            buttonGroup.name = name;
            targetGroup.add(buttonGroup);
            const button = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, 0.1), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 }));
            buttonGroup.add(button);
            const hitbox = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.4, size.y * 1.4), new THREE.MeshBasicMaterial({ visible: false }));
            hitbox.name = 'hitbox';
            buttonGroup.add(hitbox);
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const font = '32px monospace';
            context.font = font;
            canvas.width = 128;
            canvas.height = 64; 
            context.font = font;
            context.fillStyle = 'rgba(200, 200, 200, 1)';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(labelText, canvas.width / 2, canvas.height / 2);
            const texture = new THREE.CanvasTexture(canvas);
            const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
            const labelGeometry = new THREE.PlaneGeometry(size.x * 0.9, size.y * 0.9);
            const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
            labelMesh.position.z = 0.06;
            buttonGroup.add(labelMesh);
            return buttonGroup;
        }

        function createControlRow(param, labelText, yPos, targetGroup) {
            const xOffset = 0.9;
            const buttonSize = new THREE.Vector2(0.4, 0.4);
            createButton(`${param}_dec`, '-', new THREE.Vector3(xOffset, yPos, 0), buttonSize, targetGroup, colorPalette.parameter);
            createButton(`${param}_inc`, '+', new THREE.Vector3(xOffset + 0.6, yPos, 0), buttonSize, targetGroup, colorPalette.confirm);
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const font = '32px monospace';
            context.font = font;
            canvas.width = 200;
            canvas.height = 40; 
            context.font = font;
            context.fillStyle = 'rgba(200, 200, 200, 0.7)';
            context.textAlign = 'right';
            context.textBaseline = 'middle';
            context.fillText(labelText, canvas.width - 5, canvas.height / 2);
            const texture = new THREE.CanvasTexture(canvas);
            const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
            const labelGeometry = new THREE.PlaneGeometry(canvas.width / 100, canvas.height / 100);
            const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
            labelMesh.position.set(-0.5, yPos, 0);
            targetGroup.add(labelMesh);
        }

        let yPos = 1.6;
        const yStep = 0.5;
        createControlRow('scale', 'SCALE', yPos, bobControls); yPos -= yStep;
        createControlRow('damping', 'DAMPING', yPos, bobControls); yPos -= yStep;
        createControlRow('intensity', 'INTENSITY', yPos, bobControls); yPos -= yStep;
        createControlRow('opacity', 'OPACITY', yPos, bobControls); yPos -= yStep;
        createControlRow('red', 'RED', yPos, bobControls); yPos -= yStep;
        createControlRow('green', 'GREEN', yPos, bobControls); yPos -= yStep;
        createControlRow('blue', 'BLUE', yPos, bobControls);
        
        const mainUiHandle = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 4), new THREE.MeshBasicMaterial({ visible: false }));
        mainUiHandle.name = 'mainUiHandle';
        mainUiHandle.position.z = -0.1;
        bobControls.add(mainUiHandle);

        const swipeBar = new THREE.Group();
        swipeBar.position.y = -2.5;
        bobControls.add(swipeBar);
        const track = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x333333 }));
        swipeBar.add(track);
        swipeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.15), new THREE.MeshBasicMaterial({ color: 0xCCCCCC }));
        swipeBar.add(swipeHandle);
        const swipeTarget = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
        swipeTarget.name = 'swipeTarget';
        swipeTarget.position.z = -0.05;
        swipeBar.add(swipeTarget);

        yPos = 1.3;
        createControlRow('fov', 'FOV', yPos, freecamControls); yPos -= yStep;
        createControlRow('speed', 'SPEED', yPos, freecamControls); yPos -= yStep;
        createControlRow('sensitivity', 'SENSITIVITY', yPos, freecamControls); yPos -= yStep;
        createControlRow('roll', 'ROLL', yPos, freecamControls);
        
        const isTouchDevice = 'ontouchstart' in window;
        if (isTouchDevice) {
            createButton('touch_up', 'UP', new THREE.Vector3(-0.8, -1.5, 0), new THREE.Vector2(0.8, 0.8), freecamControls, colorPalette.neutral);
            createButton('touch_down', 'DN', new THREE.Vector3(0.8, -1.5, 0), new THREE.Vector2(0.8, 0.8), freecamControls, colorPalette.neutral);
        }

        const switchButton = createButton('mode_switch', 'MODE', new THREE.Vector3(0, 2.2, 0), new THREE.Vector2(1, 0.4), hudGroup, colorPalette.mode);
        const tutorialButton = createButton('tutorial', 'TUTORIAL', new THREE.Vector3(0, 2.2, 0), new THREE.Vector2(1.5, 0.4), hudGroup, colorPalette.mode);
        hudGroup.visible = false;
        const tutorial = new RecoveredTutorial();
        function tutorialSnapshot() { return {artifact:targetArtifactIndex,spin:spinOperations,rotation:[artifacts[targetArtifactIndex].rotation.x,artifacts[targetArtifactIndex].rotation.y],rgb:[pointLight.color.r,pointLight.color.g,pointLight.color.b],mode:cameraMode,fov:selectedFov,speed:FREECAM_SPEED,sensitivity:SENSITIVITY_LOOK,roll:camera.rotation.z,movement:movementDistance.slice(),position:[cameraRig.position.x,cameraRig.position.y,cameraRig.position.z]}; }
        function displayTutorial() {
            const el=document.getElementById('tutorialStatus');
            el.style.display='block'; el.textContent=tutorial.message();
            logToConsole(tutorial.message());
        }
        function setCameraMode(mode) {
            resetInput();
            cameraMode=mode;
            const consoleBox=document.getElementById('consoleContainer');
            consoleBox.style.left=mode==='free'?'10px':'auto';
            consoleBox.style.right=mode==='free'?'auto':'10px';
            freecamState.forward=freecamState.right=freecamState.up=0;
            if(mode==='free') {cameraRig.position.set(0,0,5);cameraRig.rotation.set(0,0,0);camera.rotation.set(0,0,0);}
            else if(document.pointerLockElement) document.exitPointerLock();
            logToConsole('// CAMERA MODE: '+mode.toUpperCase()+' //');
        }
        function handleSharedHudAction(intersects) {
            const hit=intersects.find(i=>i.object.name==='hitbox' && ['tutorial','mode_switch'].includes(i.object.parent.name));
            if(!hit)return false;
            if(hit.object.parent.name==='tutorial') {
                if(cameraMode!=='bob')setCameraMode('bob');
                tutorial.start(tutorialSnapshot()); displayTutorial();
            } else setCameraMode(cameraMode==='bob'?'free':'bob');
            return true;
        }
        
        const consoleMessageQueue = [];
        let isConsoleLogging = false;

        function processConsoleQueue() {
            if (consoleMessageQueue.length === 0) { isConsoleLogging = false; return; }
            isConsoleLogging = true;
            const message = consoleMessageQueue.shift();
            const consoleDiv = document.getElementById('consoleOutput');
            const line = document.createElement('div');
            line.textContent = `> ${message}`;
            consoleDiv.appendChild(line);
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
            const delay = message.length > 30 ? 350 : 150;
            setTimeout(processConsoleQueue, delay);
        }

        function logToConsole(message) {
            consoleMessageQueue.push(message);
            if (!isConsoleLogging) { processConsoleQueue(); }
            console.log(message);
        }

        function engageDiagnostic() {
            if (advancedProtocolsLoaded) return;
            document.getElementById('consoleContainer').classList.add('visible');
            logToConsole('// CONSOLE BOOT SEQUENCE INITIATED //');
            logToConsole('// DRAG SWIPE BAR TO SELECT ARTIFACT //');
            advancedProtocolsLoaded = true;
            hudGroup.visible = true;
            setTimeout(() => logToConsole('PERFORMANCE MONITOR: ACTIVE'), 250);
            setTimeout(() => logToConsole('SYSTEM MODE: DIAGNOSTIC'), 500);
            setTimeout(() => {
                logToConsole('UI PROTOCOLS: ENGAGED');
            }, 750);
        }
        // Shell launch activates the existing diagnostic exactly once.

        const raycaster = new THREE.Raycaster();
        function resolveControlHit(hit) {
            const control = hit.object.parent;
            const target = control && control.children.find(child => child.name === 'hitbox' || child.name === 'swipeTarget');
            return target ? { ...hit, object: target } : hit;
        }
        const pointer = new THREE.Vector2();
        let pressedButton = null;
        const freecamState = { forward: 0, right: 0, up: 0 };
        const heldDirections = new Set();
        const keyOwners = new Map();
        const virtualKeys = new Map();
        const qwerty = createRecoveredQwerty({THREE,document,window,camera,mount:document.getElementById('keyboard')});
        let inputEpoch = 0;
        function movementKey(key, source, down) {
            let owners=keyOwners.get(key);
            if(down){if(!owners){owners=new Set();keyOwners.set(key,owners)}owners.add(source)}
            else if(owners){owners.delete(source);if(!owners.size)keyOwners.delete(key)}
            if(keyOwners.has(key))heldDirections.add(key);else heldDirections.delete(key);
            syncTouchMovement();
        }
        function releaseVirtual(source) {
            const held=virtualKeys.get(source);if(!held)return;
            virtualKeys.delete(source);onKey({key:held.key},false,source);
            const id=Number(source.slice('virtual:pointer:'.length));
            if(source.startsWith('virtual:pointer:') && renderer.domElement.hasPointerCapture?.(id))renderer.domElement.releasePointerCapture(id);
        }
        function releaseVirtualAll() { for(const source of [...virtualKeys.keys()])releaseVirtual(source); inputEpoch++; }
        function pressVirtual(x,y,source) {
            if(!isActive()||virtualKeys.has(source))return false;
            const label=qwerty.hit(x,y);if(!label)return false;
            const key=({ESC:'Escape',BACK:'Backspace',ENTER:'Enter',SPACE:' ',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight'})[label]||label.toLowerCase();
            virtualKeys.set(source,{key,epoch:inputEpoch});onKey({key},true,source);return true;
        }
        function toggleQwerty() {
            if(!isActive())return;
            releaseVirtualAll();onPointerUp();activeTouches={};artifactRotationVelocity.x=artifactRotationVelocity.y=0;syncTouchMovement();
            qwerty.setVisible(!qwerty.visible);
            document.body.classList.toggle('qwerty-visible',qwerty.visible);
        }
        function disposeQwerty() {releaseVirtualAll();qwerty.setVisible(false);qwerty.dispose();document.body.classList.remove('qwerty-visible');}
        document.addEventListener('shellkeyboardtoggle',toggleQwerty);
        window.addEventListener('pagehide',event=>{pageSuspended=true;syncLaunch();if(!event.persisted)disposeQwerty();});
        window.addEventListener('pageshow',event=>{if(event.persisted){pageSuspended=false;syncLaunch();}});
        renderer.domElement.addEventListener('lostpointercapture', event => releaseVirtual('virtual:pointer:'+event.pointerId));
        renderer.domElement.addEventListener('pointerdown', event => {
            if(!isActive() || !qwerty.visible || (event.pointerType === 'mouse' && event.button !== 0))return;
            if(!qwerty.hit(event.clientX,event.clientY))return;
            event.preventDefault();
            try { renderer.domElement.setPointerCapture?.(event.pointerId); } catch (_) {}
            pressVirtual(event.clientX,event.clientY,'virtual:pointer:'+event.pointerId);
        });
        window.addEventListener('pointerup', event => releaseVirtual('virtual:pointer:'+event.pointerId));
        window.addEventListener('pointercancel', event => releaseVirtual('virtual:pointer:'+event.pointerId));
        document.addEventListener('focusin', event => {if(event.target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))resetInput();});
        const movementDistance = [0,0,0];
        let activeTouches = {};
        let isSwiping = false;
        let swipeStartX = 0;
        const SWIPE_THRESHOLD = 0.15;
        let isSpinningArtifact = false;
        let spinOperations = 0;
        const artifactRotationVelocity = { x: 0, y: 0 };
        const SENSITIVITY_DRAG = 0.004;
        let params = { damping: 0.95 };
        const previousPointerPosition = { x: 0, y: 0 };
        const frameTimes = [];
        const FPS_CHECK_INTERVAL = 120;
        const FPS_TARGET = 30;
        let frameCounter = 0;
        let isAdapting = false;
        let adaptationLevel = 0;
        const ADAPTATION_STEPS = [1, 0.75, 0.5];
        const warningOverlay = document.getElementById('warningOverlay');

        function checkPerformanceAndAdapt() {
            if (isAdapting || adaptationLevel >= ADAPTATION_STEPS.length - 1) return;
            const averageDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const currentFps = 1000 / averageDelta;
            if (currentFps < FPS_TARGET) {
                isAdapting = true;
                warningOverlay.style.display = 'block';
                logToConsole(`// PROTOCOL UNSTABLE // FPS: ${currentFps.toFixed(1)} // ADAPTING...`);
                setTimeout(() => {
                    adaptationLevel++;
                    onWindowResize();
                    warningOverlay.style.display = 'none';
                    isAdapting = false;
                    logToConsole(`// ADAPTATION COMPLETE // NEW RENDER SCALE: ${ADAPTATION_STEPS[adaptationLevel]}`);
                }, 2500);
            }
        }
        
        function applyAccentColor(color) {
            artifactGroup.traverse(object => {
                if (object.isLineSegments && object.material.color) object.material.color.copy(color);
            });
            hudGroup.traverse(object => {
                // Tint existing text labels; keep action button fills and warning colors semantic.
                if (object.isMesh && object.material.map && object.material.color) object.material.color.copy(color);
            });
        }

        function updateAndLogParameter(param, action) {
            const step = action === 'inc' ? 1 : -1;
            const label = param.toUpperCase();
            let logMessage = "";
            switch(param) {
                case 'scale':
                    const s = artifactGroup.scale.x + step * 0.1;
                    artifactGroup.scale.setScalar(Math.max(0.1, s));
                    logMessage = `// ${label} SET TO ${artifactGroup.scale.x.toFixed(2)} //`;
                    break;
                case 'damping':
                    params.damping = Math.max(0.8, Math.min(0.995, params.damping + step * 0.01));
                    logMessage = `// ${label} SET TO ${params.damping.toFixed(3)} //`;
                    break;
                case 'intensity':
                    pointLight.intensity = Math.max(0, pointLight.intensity + step * 0.2);
                    logMessage = `// ${label} SET TO ${pointLight.intensity.toFixed(2)} //`;
                    break;
                case 'opacity':
                    const currentArtifactO = artifacts[targetArtifactIndex];
                    currentArtifactO.children.forEach(child => {
                        if (child.material?.userData) {
                            const currentBase = child.material.userData.baseOpacity ?? 0.1;
                            child.material.userData.baseOpacity = Math.max(0, Math.min(1, currentBase + step * 0.05));
                        }
                    });
                    logMessage = `// BASE OPACITY SET //`;
                    break;
                case 'red':
                    pointLight.color.r = Math.max(0, Math.min(1, pointLight.color.r + step * 0.1));
                    artifacts[targetArtifactIndex].children.forEach(child => {
                        if (child.isMesh && child.material.color) { child.material.color.r = pointLight.color.r; }
                    });
                    logMessage = `// ${label} SET TO ${pointLight.color.r.toFixed(2)} //`;
                    break;
                case 'green':
                    pointLight.color.g = Math.max(0, Math.min(1, pointLight.color.g + step * 0.1));
                     artifacts[targetArtifactIndex].children.forEach(child => {
                        if (child.isMesh && child.material.color) { child.material.color.g = pointLight.color.g; }
                    });
                    logMessage = `// ${label} SET TO ${pointLight.color.g.toFixed(2)} //`;
                    break;
                case 'blue':
                    pointLight.color.b = Math.max(0, Math.min(1, pointLight.color.b + step * 0.1));
                     artifacts[targetArtifactIndex].children.forEach(child => {
                        if (child.isMesh && child.material.color) { child.material.color.b = pointLight.color.b; }
                    });
                    logMessage = `// ${label} SET TO ${pointLight.color.b.toFixed(2)} //`;
                    break;
                case 'fov':
                    selectedFov = Math.max(30, Math.min(120, selectedFov + step * 5));
                    onWindowResize();
                    logMessage = `// ${label} SET TO ${selectedFov.toFixed(1)} //`;
                    break;
                case 'speed':
                    FREECAM_SPEED = Math.max(1, Math.min(20, FREECAM_SPEED + step * 1));
                    logMessage = `// ${label} SET TO ${FREECAM_SPEED.toFixed(2)} //`;
                    break;
                case 'sensitivity':
                    SENSITIVITY_LOOK = Math.max(0.0005, Math.min(0.005, SENSITIVITY_LOOK + step * 0.0002));
                    logMessage = `// ${label} SET TO ${SENSITIVITY_LOOK.toFixed(4)} //`;
                    break;
                case 'roll':
                    camera.rotation.z = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, camera.rotation.z + step * 0.1));
                    logMessage = `// ${label} SET TO ${(camera.rotation.z / (Math.PI / 4) * 100).toFixed(0)}% //`;
                    break;
            }
            if (['red', 'green', 'blue'].includes(param)) applyAccentColor(pointLight.color);
            if (logMessage) logToConsole(logMessage);
        }

        function onPointerDown(event) {
            if (!isActive() || !advancedProtocolsLoaded) return;
            const clientX = event.clientX;
            const clientY = event.clientY;
            pointer.x = (clientX / window.innerWidth) * 2 - 1;
            pointer.y = - (clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            if(handleSharedHudAction(raycaster.intersectObjects([switchButton,tutorialButton],true).map(resolveControlHit)))return;
            if(qwerty.visible)return;
            if (cameraMode === 'bob') {
                const intersects = raycaster.intersectObjects(bobControls.children, true).map(resolveControlHit);
                if (intersects.length === 0) return;
                let hitProcessed = false;
                for (const intersect of intersects) {
                    const object = intersect.object;
                    if (object.name === 'hitbox') {
                        const buttonGroup = object.parent;
                        if (buttonGroup.name === 'mode_switch') {
                            setCameraMode('free');
                        } else if (buttonGroup.name.includes('_')) {
                            const [param, action] = buttonGroup.name.split('_');
                            updateAndLogParameter(param, action);
                            pressedButton = buttonGroup;
                            buttonGroup.children[0].scale.set(0.9, 0.9, 0.9);
                        }
                        hitProcessed = true;
                        break;
                    } else if (object.name === 'swipeTarget') {
                        isSwiping = true;
                        swipeStartX = pointer.x;
                        hitProcessed = true;
                        break;
                    }
                }
                if (!hitProcessed && intersects.length > 0 && intersects[0].object.name === 'mainUiHandle') {
                    isSpinningArtifact = true;
                    renderer.domElement.classList.add('grabbing');
                    previousPointerPosition.x = clientX;
                    previousPointerPosition.y = clientY;
                }
            } else if (cameraMode === 'free') {
                const hit=raycaster.intersectObjects(freecamControls.children,true).map(resolveControlHit).find(i=>i.object.name==='hitbox');
                if(hit) {
                    const buttonGroup=hit.object.parent;
                    const [param,action]=buttonGroup.name.split('_');
                    if(['fov','speed','sensitivity','roll'].includes(param)) {
                        updateAndLogParameter(param,action);
                        pressedButton=buttonGroup;
                        buttonGroup.children[0].scale.set(0.9,0.9,0.9);
                        return;
                    }
                }
                if (typeof renderer.domElement.requestPointerLock === 'function') {
                    try { Promise.resolve(renderer.domElement.requestPointerLock()).catch(() => logToConsole('MOUSE LOOK UNAVAILABLE')); }
                    catch (_) { logToConsole('MOUSE LOOK UNAVAILABLE'); }
                }
            }
        }

        function onPointerMove(event) {
            if (!isActive() || !advancedProtocolsLoaded) return;
            const clientX = event.clientX ?? event.touches[0].clientX;
            const clientY = event.clientY ?? event.touches[0].clientY;
            pointer.x = (clientX / window.innerWidth) * 2 - 1;
            pointer.y = - (clientY / window.innerHeight) * 2 + 1;
            if (isSwiping) {
                const deltaX = pointer.x - swipeStartX;
                if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
                    if (deltaX > 0) {
                        targetArtifactIndex = Math.max(0, targetArtifactIndex - 1);
                    } else {
                        targetArtifactIndex = Math.min(artifacts.length - 1, targetArtifactIndex + 1);
                    }
                    logToConsole(`// ARTIFACT SELECTED: ${shapeCatalog[targetArtifactIndex].name} //`);
                    swipeStartX = pointer.x;
                }
            } else if (isSpinningArtifact) {
                const deltaX = clientX - previousPointerPosition.x;
                const deltaY = clientY - previousPointerPosition.y;
                if(deltaX!==0 || deltaY!==0)spinOperations++;
                artifactRotationVelocity.y += deltaX * SENSITIVITY_DRAG;
                artifactRotationVelocity.x += deltaY * SENSITIVITY_DRAG;
                previousPointerPosition.x = clientX;
                previousPointerPosition.y = clientY;
            }
        }

        function onPointerUp() { 
            if (pressedButton) {
                pressedButton.children[0].scale.set(1, 1, 1);
                pressedButton = null;
            }
            isSwiping = false;
            isSpinningArtifact = false;
            syncTouchMovement();
            renderer.domElement.classList.remove('grabbing');
        }

        function onPointerLockChange() {
            if (!isActive()) {
                document.removeEventListener('mousemove', onPointerLockMove);
                if (document.pointerLockElement === renderer.domElement && document.exitPointerLock) document.exitPointerLock();
                return;
            }
            if (document.pointerLockElement === renderer.domElement) {
                document.addEventListener('mousemove', onPointerLockMove);
            } else {
                document.removeEventListener('mousemove', onPointerLockMove);
                if (cameraMode === 'free') logToConsole('MOUSE LOOK DISENGAGED (ESC PRESSED)');
            }
        }

        function onPointerLockMove(event) {
            if (!isActive() || cameraMode !== 'free') return;
            camera.rotation.y -= event.movementX * SENSITIVITY_LOOK;
            camera.rotation.x -= event.movementY * SENSITIVITY_LOOK;
            camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
        }
        
        function onTouchStart(event) {
            if (!isActive() || !advancedProtocolsLoaded) return;
            event.preventDefault();
            const touches = event.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                const touch = touches[i];
                pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
                pointer.y = - (touch.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(pointer, camera);
                if(handleSharedHudAction(raycaster.intersectObjects([switchButton,tutorialButton],true).map(resolveControlHit)))continue;
                if(qwerty.visible)continue;
                let intersects = raycaster.intersectObjects((cameraMode === 'bob' ? bobControls : freecamControls).children, true).map(resolveControlHit);
                intersects.sort((a,b) => Number(b.object.name === 'hitbox') - Number(a.object.name === 'hitbox'));
                if (intersects.length > 0) {
                    const object = intersects[0].object;
                    if (object.name === 'hitbox') {
                        const buttonGroup = object.parent;
                        if (buttonGroup.name === 'mode_switch') {
                           if (cameraMode === 'bob') {
                                cameraMode = 'free';
                                cameraRig.position.set(0, 0, 5);
                                cameraRig.rotation.set(0, 0, 0);
                                camera.rotation.set(0, 0, 0);
                            } else {
                                cameraMode = 'bob';
                            }
                           logToConsole(`// UI MODE: ${cameraMode.toUpperCase()} //`);
                        } else if (['touch_up', 'touch_down'].includes(buttonGroup.name)) {
                            activeTouches[touch.identifier] = { type: 'vertical', direction: buttonGroup.name === 'touch_up' ? 1 : -1 };
                            syncTouchMovement();
                        } else if (buttonGroup.name.includes('_')) {
                            const [param, action] = buttonGroup.name.split('_');
                            updateAndLogParameter(param, action);
                        }
                    } else if (object.name === 'swipeTarget') {
                       activeTouches[touch.identifier] = { type: 'swipe', startX: pointer.x };
                    } else if (object.name === 'mainUiHandle') {
                       activeTouches[touch.identifier] = { type: 'spin', lastX: touch.clientX, lastY: touch.clientY };
                    }
                } else if (cameraMode === 'free') {
                    activeTouches[touch.identifier] = { type: 'look', lastX: touch.clientX, lastY: touch.clientY };
                }
            }
        }

        function onTouchMove(event) {
            if (!isActive() || !advancedProtocolsLoaded) return;
            event.preventDefault();
            const touches = event.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                const touch = touches[i];
                if(qwerty.visible)continue;
                const activeTouch = activeTouches[touch.identifier];
                if (!activeTouch) continue;
                pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
                if (activeTouch.type === 'swipe') {
                    const deltaX = pointer.x - activeTouch.startX;
                    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
                        if (deltaX > 0) {
                            targetArtifactIndex = Math.max(0, targetArtifactIndex - 1);
                        } else {
                            targetArtifactIndex = Math.min(artifacts.length - 1, targetArtifactIndex + 1);
                        }
                        logToConsole(`// ARTIFACT SELECTED: ${shapeCatalog[targetArtifactIndex].name} //`);
                        activeTouch.startX = pointer.x;
                    }
                } else if (activeTouch.type === 'spin') {
                    if(touch.clientX !== activeTouch.lastX || touch.clientY !== activeTouch.lastY) spinOperations++;
                    const deltaX = touch.clientX - activeTouch.lastX;
                    const deltaY = touch.clientY - activeTouch.lastY;
                    artifactRotationVelocity.y += deltaX * SENSITIVITY_DRAG;
                    artifactRotationVelocity.x += deltaY * SENSITIVITY_DRAG;
                    activeTouch.lastX = touch.clientX;
                    activeTouch.lastY = touch.clientY;
                } else if (activeTouch.type === 'look') {
                    const deltaX = touch.clientX - activeTouch.lastX;
                    const deltaY = touch.clientY - activeTouch.lastY;
                    camera.rotation.y -= deltaX * SENSITIVITY_LOOK * 2;
                    camera.rotation.x -= deltaY * SENSITIVITY_LOOK * 2;
                    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
                    activeTouch.lastX = touch.clientX;
                    activeTouch.lastY = touch.clientY;
                }
            }
        }

        function syncTouchMovement() {
            freecamState.forward = Number(heldDirections.has('w')) - Number(heldDirections.has('s'));
            freecamState.right = Number(heldDirections.has('d')) - Number(heldDirections.has('a'));
            freecamState.up = Math.sign(Number(heldDirections.has('e')) - Number(heldDirections.has('q')) + Object.values(activeTouches).reduce((sum,t) => sum + (t.type === 'vertical' ? t.direction : 0), 0));
        }

        function onTouchEnd(event) {
            event.preventDefault();
            const touches = event.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                const touch = touches[i];
                delete activeTouches[touch.identifier];
            }
            syncTouchMovement();
        }

        function onKey(event, isDown, source = 'physical') {
            if ((!isActive() || !advancedProtocolsLoaded) && isDown) return;
            if (source === 'physical' && isDown && (event.target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))) return;
            const key = event.key.toLowerCase();
            if (cameraMode === 'free' && ['w','s','a','d','q','e'].includes(key)) {
                movementKey(key,source,isDown); return;
            }
            if (isDown) {
                if (cameraMode === 'bob') {
                     switch (event.key) {
                        case 'ArrowLeft':
                            targetArtifactIndex = Math.max(0, targetArtifactIndex - 1);
                            logToConsole(`// ARTIFACT SELECTED: ${shapeCatalog[targetArtifactIndex].name} //`);
                            break;
                        case 'ArrowRight':
                            targetArtifactIndex = Math.min(artifacts.length - 1, targetArtifactIndex + 1);
                            logToConsole(`// ARTIFACT SELECTED: ${shapeCatalog[targetArtifactIndex].name} //`);
                            break;
                        case 'c':
                            setCameraMode('free');
                            break;
                    }
                } else {
                    switch(event.key.toLowerCase()) {
                        case 'w': freecamState.forward = 1; break;
                        case 's': freecamState.forward = -1; break;
                        case 'a': freecamState.right = -1; break;
                        case 'd': freecamState.right = 1; break;
                        case 'q': freecamState.up = -1; break;
                        case 'e': freecamState.up = 1; break;
                        case '=': updateAndLogParameter('speed', 'inc'); break;
                        case '-': updateAndLogParameter('speed', 'dec'); break;
                        case ']': updateAndLogParameter('fov', 'inc'); break;
                        case '[': updateAndLogParameter('fov', 'dec'); break;
                    }
                }
            } else {
                 if (cameraMode === 'free') {
                    switch(event.key.toLowerCase()) {
                        case 'w': case 's': freecamState.forward = 0; break;
                        case 'a': case 'd': freecamState.right = 0; break;
                        case 'q': case 'e': freecamState.up = 0; break;
                    }
                }
            }
        }

        function onWindowResize() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio * ADAPTATION_STEPS[adaptationLevel]);
            camera.aspect = width / height;
            if (camera.aspect < 1) {
                const horizontalFovInRadians = selectedFov * Math.PI / 180;
                camera.fov = 2 * Math.atan(Math.tan(horizontalFovInRadians / 2) / camera.aspect) * 180 / Math.PI;
            } else {
                camera.fov = selectedFov;
            }
            camera.updateProjectionMatrix();
            const zPos = -5;
            const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.abs(zPos);
            const w = h * camera.aspect;
            hudGroup.position.set(0, 0, zPos);
            const portrait = width < height;
            const unitPerPixel = 2 * h / height;
            const scale = portrait ? Math.min((width - 24) / 3.8, (height * 0.64 - 50) / 4.8) * unitPerPixel : h / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / 5;
            bobControls.scale.setScalar(scale);
            freecamControls.scale.setScalar(scale);
            const panelY = portrait ? h - 70 * unitPerPixel - 1.9 * scale : 0;
            bobControls.position.set(portrait ? 0 : -w + 2.5 * scale, panelY, 0);
            freecamControls.position.set(portrait ? 0 : w - 2.5 * scale, panelY, 0);
            const buttonScale = portrait ? Math.min(75, width / 4) * unitPerPixel : scale;
            switchButton.scale.setScalar(buttonScale);
            tutorialButton.scale.setScalar(buttonScale);
            switchButton.position.set(portrait ? -w + 55 * unitPerPixel : -w + 1.2 * scale, portrait ? h - 35 * unitPerPixel : 2.2 * scale, 0);
            tutorialButton.position.set(portrait ? w - 90 * unitPerPixel : w - 1.4 * scale, portrait ? h - 35 * unitPerPixel : 2.2 * scale, 0);
            qwerty.fit();
        }
        
        function animate() {
            frame = null;
            if (!isActive()) return;
            frame = requestAnimationFrame(animate);
            const delta = clock.getDelta();
            const elapsedTime = clock.getElapsedTime();
            frameTimes.push(delta * 1000);
            if (frameTimes.length > 60) frameTimes.shift();
            if (advancedProtocolsLoaded && ++frameCounter >= FPS_CHECK_INTERVAL) checkPerformanceAndAdapt();
            
            bobControls.visible = (cameraMode === 'bob' && !qwerty.visible);
            freecamControls.visible = (cameraMode === 'free' && !qwerty.visible);
            
            if (cameraMode === 'bob') {
                cameraRig.position.x = Math.sin(elapsedTime * 0.2) * 1.5;
                cameraRig.position.y = Math.cos(elapsedTime * 0.3) * 1.0;
                cameraRig.position.z = 5;
                camera.lookAt(0,0,0);
                const targetAngle = -targetArtifactIndex * ANGLE_STEP;
                targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                artifactGroup.quaternion.slerp(targetQuaternion, 0.05);
                artifacts.forEach((artifact, index) => {
                    const isSelected = (index === targetArtifactIndex);
                    const targetScale = isSelected ? 1.1 : 0.8;
                    artifact.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
                    artifact.children.forEach(child => {
                        if (child.material?.userData) {
                            const baseOpacity = child.material.userData.baseOpacity ?? 0.1;
                            const targetOpacity = isSelected ? baseOpacity : baseOpacity * 0.5;
                            if (Math.abs(child.material.opacity - targetOpacity) > 0.01) {
                                child.material.opacity = THREE.MathUtils.lerp(child.material.opacity, targetOpacity, 0.1);
                            }
                        }
                    });
                });
                const currentArtifact = artifacts[targetArtifactIndex];
                if (currentArtifact) {
                    currentArtifact.rotation.x += artifactRotationVelocity.x;
                    currentArtifact.rotation.y += artifactRotationVelocity.y;
                    artifactRotationVelocity.x *= params.damping;
                    artifactRotationVelocity.y *= params.damping;
                }
                if (swipeHandle) {
                    const trackWidth = 3.0;
                    const handleRange = trackWidth * 0.9;
                    const normalizedPosition = targetArtifactIndex / (artifacts.length - 1);
                    const targetX = (normalizedPosition - 0.5) * handleRange;
                    swipeHandle.position.x = THREE.MathUtils.lerp(swipeHandle.position.x, targetX, 0.1);
                }
            } else if (cameraMode === 'free') {
                const totalForward = freecamState.forward;
                const totalRight = freecamState.right;
                const totalUp = freecamState.up;
                const moveDirection = new THREE.Vector3(totalRight, 0, -totalForward);
                moveDirection.normalize().applyQuaternion(camera.quaternion);
                cameraRig.position.addScaledVector(moveDirection, FREECAM_SPEED * delta);
                cameraRig.position.y += totalUp * FREECAM_SPEED * delta;
                const actualDistance=FREECAM_SPEED*delta;
                if(totalForward)movementDistance[0]+=Math.abs(actualDistance*totalForward);
                if(totalRight)movementDistance[1]+=Math.abs(actualDistance*totalRight);
                if(totalUp)movementDistance[2]+=Math.abs(actualDistance*totalUp);
            }
            if(tutorial.observe(tutorialSnapshot()))displayTutorial();
            renderer.render(scene, camera);
        }

        onWindowResize();
        renderer.domElement.addEventListener('mousedown', onPointerDown);
        renderer.domElement.addEventListener('mousemove', onPointerMove);
        renderer.domElement.addEventListener('mouseup', onPointerUp);
        renderer.domElement.addEventListener('mouseleave', onPointerUp);
        renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
        renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
        renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: false });
        renderer.domElement.addEventListener('touchcancel', onTouchEnd, { passive: false });
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('keydown', (e) => onKey(e, true));
        window.addEventListener('keyup', (e) => onKey(e, false));
        document.addEventListener('pointerlockchange', onPointerLockChange);
        function resetInput() {
            releaseVirtualAll();
            onPointerUp(); activeTouches = {}; heldDirections.clear(); keyOwners.clear();
            freecamState.forward = freecamState.right = freecamState.up = 0;
            artifactRotationVelocity.x = artifactRotationVelocity.y = 0;
            document.removeEventListener('mousemove', onPointerLockMove);
        }
        function syncLaunch() {
            if (!isActive()) {
                if (frame !== null) cancelAnimationFrame(frame);
                frame = null; clock.stop(); resetInput();
                if (document.pointerLockElement === renderer.domElement && document.exitPointerLock) document.exitPointerLock();
                return;
            }
            engageDiagnostic();
            if (frame !== null) return;
            clock.start(); animate();
        }
        window.addEventListener('blur', resetInput);
        renderer.domElement.addEventListener('pointercancel', event => {
            const source='virtual:pointer:'+event.pointerId;
            if(virtualKeys.has(source))releaseVirtual(source);else if(!qwerty.visible)resetInput();
        });
        document.addEventListener('visibilitychange', syncLaunch);
        document.addEventListener('shellstatechange', syncLaunch);
        syncLaunch();
    
} catch (error) {
    reportSceneFailure(error);
}
})();
