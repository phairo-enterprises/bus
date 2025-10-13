// main.js - v0.05

// Waits for the HTML document to be fully loaded.
window.addEventListener('DOMContentLoaded', () => {
    
    const immersionPrompt = document.getElementById('immersion-prompt');

    // Attaches the fullscreen request to the prompt's click event.
    if (immersionPrompt) {
        immersionPrompt.addEventListener('click', () => {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
            });
        });
    }
});

// Listens for the browser entering or exiting fullscreen mode.
document.addEventListener('fullscreenchange', () => {
    // Toggles the .launched class on the body to trigger all CSS animations.
    if (document.fullscreenElement) {
        document.body.classList.add('launched');
    } else {
        document.body.classList.remove('launched');
    }
});
