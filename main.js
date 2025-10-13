// main.js - v0.10

window.addEventListener('DOMContentLoaded', () => {
    
    const immersionPrompt = document.getElementById('immersion-prompt');
    const handle = document.getElementById('handle');
    const trackpadArea = document.getElementById('trackpad-area');
    const pointerTemp = document.getElementById('pointer-temp');

    if (immersionPrompt) {
        immersionPrompt.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
                });
            }
        });
    }

    // Adds the toggle functionality to the new, static handle.
    if (handle && trackpadArea && pointerTemp) {
        handle.addEventListener('click', () => {
            // Toggles the visibility of the trackpad and the draggable pointer.
            trackpadArea.classList.toggle('visible');
            pointerTemp.classList.toggle('visible');
        });
    }

    // The draggable functionality remains attached to the pointer.
    if (pointerTemp) {
        let active = false;
        let currentX, currentY, initialX, initialY;
        let xOffset = 0, yOffset = 0;

        const dragStart = (e) => {
            if (e.target === pointerTemp) {
                active = true;
                pointerTemp.classList.add('dragging');
                if (e.type === "touchstart") {
                    initialX = e.touches[0].clientX - xOffset;
                    initialY = e.touches[0].clientY - yOffset;
                } else {
                    initialX = e.clientX - xOffset;
                    initialY = e.clientY - yOffset;
                }
            }
        };

        const dragEnd = (e) => {
            if (active) {
                active = false;
                pointerTemp.classList.remove('dragging');
            }
        };

        const drag = (e) => {
            if (active) {
                e.preventDefault();
                if (e.type === "touchmove") {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                xOffset = currentX;
                yOffset = currentY;
                setTranslate(currentX, yOffset, pointerTemp);
            }
        };

        const setTranslate = (x, y, el) => {
            el.style.transform = `translateX(-50%) translate3d(${x}px, ${y}px, 0)`;
        };

        window.addEventListener('mousedown', dragStart, false);
        window.addEventListener('mouseup', dragEnd, false);
        window.addEventListener('mousemove', drag, false);
        window.addEventListener('touchstart', dragStart, false);
        window.addEventListener('touchend', dragEnd, false);
        window.addEventListener('touchmove', drag, false);
    }
});

document.addEventListener('fullscreenchange', () => {
    const immersionPrompt = document.getElementById('immersion-prompt');

    if (document.fullscreenElement) {
        document.body.classList.add('launched');
        document.body.classList.remove('paused');
        if (immersionPrompt) immersionPrompt.textContent = '// INITIATE IMMERSION //';
    } else {
        document.body.classList.remove('launched');
        document.body.classList.add('paused');
        if (immersionPrompt) immersionPrompt.textContent = '// RESUME //';
    }
});
