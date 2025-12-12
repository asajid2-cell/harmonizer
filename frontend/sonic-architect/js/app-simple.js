console.log('✅ Simple app.js loaded successfully!');
console.log('Testing if basic JS execution works...');

// Hide loader and overlay immediately
setTimeout(() => {
    const loader = document.getElementById('loader');
    const overlay = document.getElementById('overlay');

    if (loader) {
        loader.classList.add('is-loaded');
        console.log('✅ Loader hidden');
    }

    if (overlay) {
        overlay.classList.add('is-hidden');
        console.log('✅ Overlay hidden - app should now be visible!');
    }
}, 1000);
