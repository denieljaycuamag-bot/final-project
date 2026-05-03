import { registerRootComponent } from 'expo';
import App from '../app/_layout';

// Add error boundary for web
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
  });
}

registerRootComponent(App);

