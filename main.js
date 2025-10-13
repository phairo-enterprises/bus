// main.js - v0.07
window.addEventListener('DOMContentLoaded', () => {
    const immersionPrompt = document.getElementById('immersion-prompt');
    const handle = document.getElementById('handle');
    const container = document.getElementById('shell-overlay');

    // Logic for the immersion prompt and fullscreen request.
    if (immersionPrompt) {
        immersionPrompt.addEventListener('click', () => {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
            });
        });
    }

    // Logic for making the Handle instrument draggable.
    if (handle && container) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        // The dragStart function initializes the drag operation.
        const dragStart = (e) => {
            initialX = e.type === 'touchstart' ? e.touches[0].clientX - xOffset : e.clientX - xOffset;
            initialY = e.type === 'touchstart' ? e.touches[0].clientY - yOffset : e.clientY - yOffset;

            if (e.target === handle) {
                isDragging = true;
                handle.classList.add('dragging');
            }
        };

        // The dragEnd function terminates the drag operation.
        const dragEnd = (e) => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            handle.classList.remove('dragging');
        };

        // The drag function calculates and applies the new position of the Handle.
        const drag = (e) => {
            if (isDragging) {
                e.preventDefault();
                if (e.type === 'touchmove') {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                xOffset = currentX;
                yOffset = currentY;
                
                // This is a placeholder for moving the entire instrument cluster later.
                // For now, it only moves the Handle itself.
                setTranslate(currentX, currentY, handle);
            }
        };

        const setTranslate = (xPos, yPos, el) => {
            // We use transform for performance benefits.
            // Note: This simple implementation will need to be updated when moving the entire cluster.
            el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
        };

        // Attach event listeners for mouse and touch interaction.
        container.addEventListener('touchstart', dragStart, false);
        container.addEventListener('touchend', dragEnd, false);
        container.addEventListener('touchmove', drag, false);

        container.addEventListener('mousedown', dragStart, false);
        container.addEventListener('mouseup', dragEnd, false);
        container.addEventListener('mousemove', drag, false);
    }
});

// Logic for the launch sequence animation trigger.
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        document.body.classList.add('launched');
    } else {
        document.body.classList.remove('launched');
    }
});
