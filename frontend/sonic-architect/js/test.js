// Test script - not a module
console.log('✅✅✅ TEST.JS LOADED - Regular script works!');

// Try to hide loader
setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('is-loaded');
        console.log('✅ Loader hidden by test.js');
    } else {
        console.error('❌ Loader element not found');
    }
}, 1000);
