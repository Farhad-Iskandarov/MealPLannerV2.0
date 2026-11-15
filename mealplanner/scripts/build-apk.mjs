import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const rootDir = process.cwd();
const sdkDir = join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const buildToolsDir = join(sdkDir, 'build-tools', '35.0.0');
const platformJar = join(sdkDir, 'platforms', 'android-35', 'android.jar');
const jdkBinDir = resolve(rootDir, '../.tools/jdk/bin');

const aapt2 = join(buildToolsDir, 'aapt2.exe');
const d8 = join(buildToolsDir, 'd8.bat');
const zipalign = join(buildToolsDir, 'zipalign.exe');
const apksigner = join(buildToolsDir, 'apksigner.bat');
const javac = join(jdkBinDir, 'javac.exe');
const jarExe = join(jdkBinDir, 'jar.exe');
const keytool = join(jdkBinDir, 'keytool.exe');

const env = {
  ...process.env,
  JAVA_HOME: resolve(rootDir, '../.tools/jdk'),
  PATH: `${jdkBinDir};${buildToolsDir};${process.env.PATH}`,
};

console.log('1. Preparing Android assets (copying dist/public -> android/app/src/main/assets/www)...');
const assetsWww = join(rootDir, 'android/app/src/main/assets/www');
mkdirSync(assetsWww, { recursive: true });
copyFileSync(join(rootDir, 'dist/public/index.html'), join(assetsWww, 'index.html'));
copyFileSync(join(rootDir, 'dist/public/bundle.js'), join(assetsWww, 'bundle.js'));
copyFileSync(join(rootDir, 'dist/public/bundle.css'), join(assetsWww, 'bundle.css'));

const buildWork = join(rootDir, 'android/app/build/inter');
rmSync(buildWork, { recursive: true, force: true });
mkdirSync(join(buildWork, 'compiled_res'), { recursive: true });
mkdirSync(join(buildWork, 'gen'), { recursive: true });
mkdirSync(join(buildWork, 'classes'), { recursive: true });
mkdirSync(join(buildWork, 'dex'), { recursive: true });
mkdirSync(join(buildWork, 'apk_stage/assets/www'), { recursive: true });

copyFileSync(join(rootDir, 'dist/public/index.html'), join(buildWork, 'apk_stage/assets/www/index.html'));
copyFileSync(join(rootDir, 'dist/public/bundle.js'), join(buildWork, 'apk_stage/assets/www/bundle.js'));
copyFileSync(join(rootDir, 'dist/public/bundle.css'), join(buildWork, 'apk_stage/assets/www/bundle.css'));

const apkOutDir = join(rootDir, 'android/app/build/outputs/apk/debug');
mkdirSync(apkOutDir, { recursive: true });

console.log('2. Compiling Android resources with aapt2...');
execFileSync(
  aapt2,
  [
    'compile',
    '--dir',
    join(rootDir, 'android/app/src/main/res'),
    '-o',
    join(buildWork, 'compiled_res/res.zip'),
  ],
  { env, stdio: 'inherit' }
);

console.log('3. Linking resources into base APK with aapt2...');
const unalignedApk = join(buildWork, 'unaligned.apk');
execFileSync(
  aapt2,
  [
    'link',
    '-I',
    platformJar,
    '--manifest',
    join(rootDir, 'android/app/src/main/AndroidManifest.xml'),
    '--java',
    join(buildWork, 'gen'),
    '-o',
    unalignedApk,
    join(buildWork, 'compiled_res/res.zip'),
  ],
  { env, stdio: 'inherit' }
);

console.log('4. Compiling Java sources (MainActivity.java + R.java) with javac...');
execFileSync(
  javac,
  [
    '--release',
    '11',
    '-classpath',
    platformJar,
    '-d',
    join(buildWork, 'classes'),
    join(rootDir, 'android/app/src/main/java/pl/mealplanner/app/MainActivity.java'),
    join(buildWork, 'gen/pl/mealplanner/app/R.java'),
  ],
  { env, stdio: 'inherit' }
);

console.log('5. Converting JVM bytecode to Dalvik DEX (classes.dex) with d8...');
execFileSync(
  'cmd.exe',
  [
    '/c',
    d8,
    '--lib',
    platformJar,
    '--output',
    join(buildWork, 'dex'),
    join(buildWork, 'classes/pl/mealplanner/app/MainActivity.class'),
    join(buildWork, 'classes/pl/mealplanner/app/MainActivity$1.class'),
    join(buildWork, 'classes/pl/mealplanner/app/R.class'),
    join(buildWork, 'classes/pl/mealplanner/app/R$string.class'),
  ],
  { env, stdio: 'inherit' }
);

console.log('6. Adding classes.dex and POSIX-path assets/www/* into APK archive...');
execFileSync(
  jarExe,
  ['-uf', unalignedApk, '-C', join(buildWork, 'dex'), 'classes.dex'],
  { env, stdio: 'inherit' }
);
execFileSync(
  jarExe,
  ['-uf', unalignedApk, '-C', join(buildWork, 'apk_stage'), 'assets/www/index.html', '-C', join(buildWork, 'apk_stage'), 'assets/www/bundle.js', '-C', join(buildWork, 'apk_stage'), 'assets/www/bundle.css'],
  { env, stdio: 'inherit' }
);

console.log('7. Aligning APK with zipalign...');
const alignedApk = join(buildWork, 'aligned.apk');
execFileSync(zipalign, ['-f', '4', unalignedApk, alignedApk], { env, stdio: 'inherit' });

const keystorePath = join(buildWork, 'debug.keystore');
if (!existsSync(keystorePath)) {
  console.log('8. Generating Android debug keystore...');
  execFileSync(
    keytool,
    [
      '-genkeypair',
      '-v',
      '-keystore',
      keystorePath,
      '-storepass',
      'android',
      '-alias',
      'androiddebugkey',
      '-keypass',
      'android',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-dname',
      'CN=Android Debug,O=MealPlanner Poland,C=PL',
    ],
    { env, stdio: 'inherit' }
  );
}

const finalApk = join(apkOutDir, 'MealPlanner-debug.apk');
console.log('9. Signing APK with apksigner...');
execFileSync(
  'cmd.exe',
  [
    '/c',
    apksigner,
    'sign',
    '--ks',
    keystorePath,
    '--ks-pass',
    'pass:android',
    '--key-pass',
    'pass:android',
    '--out',
    finalApk,
    alignedApk,
  ],
  { env, stdio: 'inherit' }
);

copyFileSync(finalApk, join(rootDir, 'MealPlanner.apk'));
console.log(`SUCCESS! Built and signed Android APK at:\n - ${finalApk}\n - ${join(rootDir, 'MealPlanner.apk')}`);
