const fs = require('fs');
const path = require('path');

function patchDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      patchDirectory(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;

      // 1. Replace Readonly<{ with $ReadOnly<{ (handling spacing)
      const content1 = content.replace(/Readonly\s*<\s*{/g, '$ReadOnly<{');
      if (content1 !== content) {
        content = content1;
        modified = true;
      }

      // 2. Replace ReadonlyArray< with $ReadOnlyArray< (handling spacing)
      const content2 = content.replace(/ReadonlyArray\s*</g, '$ReadOnlyArray<');
      if (content2 !== content) {
        content = content2;
        modified = true;
      }

      // 3. Replace TS-style 'as Type' with Flow-style cast
      const content3 = content.replace(
        /export default\s+(codegenNativeComponent<([a-zA-Z0-9_]+)>([\s\S]*?))\s+as\s+([a-zA-Z0-9_<>\s]+);/g,
        'export default ($1: $4);'
      );
      if (content3 !== content) {
        content = content3;
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Successfully patched: ${filePath}`);
      }
    }
  });
}

const targetDirs = [
  path.join(__dirname, '../node_modules/react-native/src/private/components'),
  path.join(__dirname, '../node_modules/react-native/src/private/specs_DEPRECATED/components')
];

targetDirs.forEach(patchDirectory);
