// main.js - v0.08

// Waits for the HTML document to be fully loaded.
window.addEventListener('DOMContentLoaded', () => {
    
    const immersionPrompt = document.getElementById('immersion-prompt');
    const handle = document.getElementById('handle');

    // Attaches the fullscreen request to the prompt's click event.
    if (immersionPrompt) {
        immersionPrompt.addEventListener('click', () => {
            // Only request fullscreen if not already in fullscreen (e.g. in paused state)
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
                });
            }
        });
    }

    // Adds draggable functionality to the Handle instrument.
    if (handle) {
        let active = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        const dragStart = (e) => {
            if (e.target === handle) {
                active = true;
                handle.classList.add('dragging');

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
                initialX = currentX;
                initialY = currentY;
                active = false;
                handle.classList.remove('dragging');
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

                setTranslate(currentX, yOffset, handle);
            }
        };

        const setTranslate = (x, y, el) => {
            // Applies the drag offset while preserving the initial centering transform.
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

// Listens for the browser entering or exiting fullscreen mode to manage shell state.
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
