// main.js - v0.10

let shellStateRevision = 0;

function setShellLaunched(launched) {
    shellStateRevision++;
    document.body.classList.toggle('launched', launched);
    document.body.classList.toggle('paused', !launched);
    const prompt = document.getElementById('immersion-prompt');
    if (prompt) prompt.textContent = launched ? '// INITIATE IMMERSION //' : '// RESUME //';
    document.dispatchEvent(new Event('shellstatechange'));
}

window.addEventListener('DOMContentLoaded', () => {
    
    const immersionPrompt = document.getElementById('immersion-prompt');
    const pointerTemp = document.getElementById('pointer-temp');
    const trackpadArea = document.getElementById('trackpad-area');

    if (immersionPrompt) {
        immersionPrompt.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); immersionPrompt.click(); }
        });
        let fullscreenRequestPending = false;
        immersionPrompt.addEventListener('click', () => {
            if (window.backupStratsRendererUnavailable) return;
            if (!document.fullscreenElement && !fullscreenRequestPending) {
                fullscreenRequestPending = true;
                const requestRevision = shellStateRevision;
                const enterWindowed = err => {
                    fullscreenRequestPending = false;
                    // A newer launch/pause transition supersedes this request.
                    if (requestRevision !== shellStateRevision || document.fullscreenElement) return;
                    if (err) console.warn('Fullscreen unavailable; continuing in windowed mode.', err);
                    setShellLaunched(true);
                };
                try {
                    if (typeof document.documentElement.requestFullscreen !== 'function') {
                        enterWindowed();
                        return;
                    }
                    Promise.resolve(document.documentElement.requestFullscreen()).then(
                        () => { fullscreenRequestPending = false; },
                        enterWindowed
                    );
                } catch (err) {
                    enterWindowed(err);
                }
            }
        });
    }

    if (pointerTemp && trackpadArea) {
        let active = false, touchId = null, initialX = 0, initialY = 0, xOffset = 0, yOffset = 0, startX = 0, startY = 0, moved = false;
        function place(x, y) {
            const rect = pointerTemp.getBoundingClientRect();
            const baseLeft = rect.left - xOffset, baseTop = rect.top - yOffset;
            xOffset = Math.max(-baseLeft, Math.min(window.innerWidth - baseLeft - rect.width, x));
            yOffset = Math.max(-baseTop, Math.min(window.innerHeight - baseTop - rect.height, y));
            pointerTemp.style.transform = `translateX(-50%) translate3d(${xOffset}px, ${yOffset}px, 0)`;
        }
        function stopDrag() { active = false; touchId = null; pointerTemp.classList.remove('dragging'); }
        function startDrag(e) {
            if (active || e.target !== pointerTemp || !document.body.classList.contains('launched')) return;
            const point = e.type === 'touchstart' ? e.changedTouches[0] : e;
            if (!point || (e.type === 'mousedown' && e.button !== 0)) return;
            if(e.type === 'touchstart')e.preventDefault();
            startX=point.clientX;startY=point.clientY;moved=false;
            active = true; touchId = e.type === 'touchstart' ? point.identifier : null;
            initialX = point.clientX - xOffset; initialY = point.clientY - yOffset;
            pointerTemp.classList.add('dragging'); trackpadArea.classList.add('visible', 'side-right');
        }
        function drag(e) {
            if (!active) return;
            const point = touchId === null ? (e.type === 'mousemove' ? e : null) : Array.from(e.changedTouches || []).find(t => t.identifier === touchId);
            if (!point) return;
            e.preventDefault();
            if(Math.hypot(point.clientX-startX,point.clientY-startY)>1.5)moved=true;
            place(point.clientX - initialX, point.clientY - initialY);
        }
        function endDrag(e) {
            if (touchId !== null && !Array.from(e.changedTouches || []).some(t => t.identifier === touchId)) return;
            const tap=active&&!moved&&['mouseup','touchend'].includes(e.type);
            stopDrag();
            if(tap)document.dispatchEvent(new Event('shellkeyboardtoggle'));
        }
        window.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', drag);
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchstart', startDrag, { passive: false });
        window.addEventListener('touchmove', drag, { passive: false });
        window.addEventListener('touchend', endDrag);
        window.addEventListener('touchcancel', endDrag);
        window.addEventListener('blur', stopDrag);
        window.addEventListener('pagehide', stopDrag);
        window.addEventListener('pointercancel', stopDrag);
        document.addEventListener('shellstatechange', stopDrag);
        document.addEventListener('visibilitychange', stopDrag);
        window.addEventListener('resize', () => { stopDrag(); place(xOffset, yOffset); });
    }
});

document.addEventListener('fullscreenchange', () => {
    setShellLaunched(Boolean(document.fullscreenElement));
});

function reportSceneFailure(error) {
    window.backupStratsRendererUnavailable = true;
    setShellLaunched(false);
    const prompt = document.getElementById('immersion-prompt');
    if (prompt) { prompt.textContent = '// RENDERER UNAVAILABLE: RELOAD PAGE //'; prompt.setAttribute('aria-disabled', 'true'); }
    console.warn('The renderer could not start.', error);
}
