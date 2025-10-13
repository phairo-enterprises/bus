// main.js - v0.04

// This function waits for the entire HTML document to be loaded and ready.
window.addEventListener('DOMContentLoaded', () => {
    
    // Finds the immersion prompt element in the HTML.
    const immersionPrompt = document.getElementById('immersion-prompt');

    // If the prompt exists, attach a click event listener to it.
    if (immersionPrompt) {
        immersionPrompt.addEventListener('click', () => {
            // When clicked, request to enter fullscreen mode.
            document.documentElement.requestFullscreen().catch(err => {
                // Logs an error to the console if fullscreen fails.
                console.error(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
            });
        });
    }
});
