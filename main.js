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
