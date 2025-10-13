// main.js - v0.06

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

// Listens for the browser entering or exiting fullscreen mode to manage shell state.
document.addEventListener('fullscreenchange', () => {
    const immersionPrompt = document.getElementById('immersion-prompt');

    if (document.fullscreenElement) {
        // We have entered fullscreen: activate the launched state.
        document.body.classList.add('launched');
        document.body.classList.remove('paused');
        // Ensure prompt text is correct for the next time it's needed.
        if (immersionPrompt) immersionPrompt.textContent = '// INITIATE IMMERSION //';
    } else {
        // We have exited fullscreen: activate the paused state.
        document.body.classList.remove('launched');
        document.body.classList.add('paused');
        // Change prompt text to RESUME.
        if (immersionPrompt) immersionPrompt.textContent = '// RESUME //';
    }
});
