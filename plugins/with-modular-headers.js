const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to add use_modular_headers! to Podfile
 * This fixes the Firebase Analytics Swift pods integration issue
 */
const withModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');
        
        // Check if use_modular_headers! already exists
        if (!podfileContent.includes('use_modular_headers!')) {
          // Add use_modular_headers! after the platform line
          const platformRegex = /platform :ios, ['"]([\d.]+)['"]/;
          const match = podfileContent.match(platformRegex);
          
          if (match) {
            // Insert use_modular_headers! after the platform line
            const insertIndex = match.index + match[0].length;
            podfileContent = podfileContent.slice(0, insertIndex) + 
              '\nuse_modular_headers!' + 
              podfileContent.slice(insertIndex);
            
            fs.writeFileSync(podfilePath, podfileContent, 'utf8');
            console.log('✅ Added use_modular_headers! to Podfile');
          } else {
            // If no platform line found, add at the beginning after target definition
            const targetRegex = /target ['"]([\w]+)['"] do/;
            const targetMatch = podfileContent.match(targetRegex);
            
            if (targetMatch) {
              const insertIndex = targetMatch.index + targetMatch[0].length;
              podfileContent = podfileContent.slice(0, insertIndex) + 
                '\n  use_modular_headers!' + 
                podfileContent.slice(insertIndex);
              
              fs.writeFileSync(podfilePath, podfileContent, 'utf8');
              console.log('✅ Added use_modular_headers! to Podfile');
            } else {
              // Last resort: add at the top of the file
              podfileContent = 'use_modular_headers!\n' + podfileContent;
              fs.writeFileSync(podfilePath, podfileContent, 'utf8');
              console.log('✅ Added use_modular_headers! to Podfile');
            }
          }
        }
      }
      
      return config;
    },
  ]);
};

module.exports = withModularHeaders;

