import { registerRootComponent } from 'expo';
import { setupRTL } from './src/setup/rtl';
import App from './App';

// Hebrew app: enable real right-to-left layout before anything renders
setupRTL();

// Register the main component
registerRootComponent(App);
