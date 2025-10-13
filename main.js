// main.js - v0.04
// Handles the initial prompt click to request fullscreen.
window.addEventListener('DOMContentLoaded', () => {
    const immersionPrompt = document.getElementById('immersion-prompt');
    if (immersionPrompt) {
        immersionPrompt.addEventListener('click', () => {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
            });
        });
    }
});

// Listens for fullscreen changes to trigger the launch sequence animation.
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        // If we have entered fullscreen, add the .launched class to the body.
        document.body.classList.add('launched');
    } else {
        // If we have exited fullscreen, remove the class to reset the state.
        document.body.classList.remove('launched');
    }
});
