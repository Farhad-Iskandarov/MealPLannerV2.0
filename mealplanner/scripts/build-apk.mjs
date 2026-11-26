import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const rootDir = process.cwd();
const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');

function resolveBuildToolsDir() {
  const btRoot = join(sdkDir, 'build-tools');
  if (!existsSync(btRoot)) return join(btRoot, '35.0.0');
  const versions = readdirSync(btRoot).sort().reverse();
  return join(btRoot, versions[0] || '35.0.0');
}

function resolvePlatformJar() {
  const platformsRoot = join(sdkDir, 'platforms');
  const preferred = ['android-36', 'android-35', 'android-34'];
  for (const p of preferred) {
    const candidate = join(platformsRoot, p, 'android.jar');
    if (existsSync(candidate)) return candidate;
  }
  return join(platformsRoot, 'android-35', 'android.jar');
}

const buildToolsDir = resolveBuildToolsDir();
const platformJar = resolvePlatformJar();
const jdkHome = process.env.JAVA_HOME || resolve(rootDir, '../.tools/jdk');
const jdkBinDir = join(jdkHome, 'bin');

const aapt2 = join(buildToolsDir, 'aapt2.exe');
const d8 = join(buildToolsDir, 'd8.bat');
const zipalign = join(buildToolsDir, 'zipalign.exe');
const apksigner = join(buildToolsDir, 'apksigner.bat');
const javac = join(jdkBinDir, 'javac.exe');
const jarExe = join(jdkBinDir, 'jar.exe');
const keytool = join(jdkBinDir, 'keytool.exe');
const hasJdk = existsSync(javac) && existsSync(jarExe);

const env = {
  ...process.env,
  ...(hasJdk ? { JAVA_HOME: jdkHome, PATH: `${jdkBinDir};${buildToolsDir};${process.env.PATH}` } : { PATH: `${buildToolsDir};${process.env.PATH}` }),
};

console.log('1. Preparing Android assets (copying dist/public -> android/app/src/main/assets/www)...');
const assetsWww = join(rootDir, 'android/app/src/main/assets/www');
mkdirSync(assetsWww, { recursive: true });
copyFileSync(join(rootDir, 'dist/public/index.html'), join(assetsWww, 'index.html'));
copyFileSync(join(rootDir, 'dist/public/bundle.js'), join(assetsWww, 'bundle.js'));
copyFileSync(join(rootDir, 'dist/public/bundle.css'), join(assetsWww, 'bundle.css'));
if (existsSync(join(rootDir, 'dist/public/assets'))) {
  cpSync(join(rootDir, 'dist/public/assets'), join(assetsWww, 'assets'), { recursive: true });
}

const buildWork = join(rootDir, 'android/app/build/inter');
rmSync(join(buildWork, 'compiled_res'), { recursive: true, force: true });
rmSync(join(buildWork, 'apk_stage'), { recursive: true, force: true });
mkdirSync(join(buildWork, 'compiled_res'), { recursive: true });
mkdirSync(join(buildWork, 'gen'), { recursive: true });
mkdirSync(join(buildWork, 'classes'), { recursive: true });
mkdirSync(join(buildWork, 'dex'), { recursive: true });
mkdirSync(join(buildWork, 'apk_stage/assets/www'), { recursive: true });

copyFileSync(join(rootDir, 'dist/public/index.html'), join(buildWork, 'apk_stage/assets/www/index.html'));
copyFileSync(join(rootDir, 'dist/public/bundle.js'), join(buildWork, 'apk_stage/assets/www/bundle.js'));
copyFileSync(join(rootDir, 'dist/public/bundle.css'), join(buildWork, 'apk_stage/assets/www/bundle.css'));
if (existsSync(join(rootDir, 'dist/public/assets'))) {
  cpSync(join(rootDir, 'dist/public/assets'), join(buildWork, 'apk_stage/assets/www/assets'), { recursive: true });
}

const apkOutDir = join(rootDir, 'android/app/build/outputs/apk/debug');
mkdirSync(apkOutDir, { recursive: true });

console.log(`2. Compiling Android resources with aapt2 (using platform ${platformJar})...`);
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

const dexFile = join(buildWork, 'dex/classes.dex');
if (hasJdk) {
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

  const classDir = join(buildWork, 'classes/pl/mealplanner/app');
  const classFiles = readdirSync(classDir)
    .filter((f) => f.endsWith('.class'))
    .map((f) => join(classDir, f));

  console.log('5. Converting JVM bytecode to Dalvik DEX (classes.dex) with d8...');
  execFileSync(
    'cmd.exe',
    ['/c', d8, '--lib', platformJar, '--output', join(buildWork, 'dex'), ...classFiles],
    { env, stdio: 'inherit' }
  );
} else if (existsSync(dexFile)) {
  console.log('4-5. Local JDK not found on PATH; reusing precompiled classes.dex...');
} else {
  throw new Error('Neither JDK (javac) nor precompiled classes.dex was found.');
}

console.log('6. Adding classes.dex and POSIX-path assets/www/* into APK archive...');
if (hasJdk) {
  execFileSync(
    jarExe,
    ['-uf', unalignedApk, '-C', join(buildWork, 'dex'), 'classes.dex'],
    { env, stdio: 'inherit' }
  );
  const jarArgs = [
    '-uf',
    unalignedApk,
    '-C',
    join(buildWork, 'apk_stage'),
    'assets/www/index.html',
    '-C',
    join(buildWork, 'apk_stage'),
    'assets/www/bundle.js',
    '-C',
    join(buildWork, 'apk_stage'),
    'assets/www/bundle.css',
  ];
  if (existsSync(join(buildWork, 'apk_stage/assets/www/assets'))) {
    jarArgs.push('-C', join(buildWork, 'apk_stage'), 'assets/www/assets');
  }
  execFileSync(jarExe, jarArgs, { env, stdio: 'inherit' });
} else {
  const pyScript = `
import os, sys, zipfile
apk_path, dex_path, stage_dir = sys.argv[1], sys.argv[2], sys.argv[3]
www_dir = os.path.join(stage_dir, 'assets', 'www')
with zipfile.ZipFile(apk_path, 'a', compression=zipfile.ZIP_DEFLATED) as zf:
    zf.write(dex_path, 'classes.dex')
    for root, _, files in os.walk(www_dir):
        for fname in files:
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, stage_dir).replace('\\\\', '/')
            zf.write(full, rel)
`;
  execFileSync('python', ['-c', pyScript, unalignedApk, dexFile, join(buildWork, 'apk_stage')], {
    env,
    stdio: 'inherit',
  });
}

console.log('7. Aligning APK with zipalign (-P 16 for 16 KB page-size support)...');
const alignedApk = join(buildWork, 'aligned.apk');
execFileSync(zipalign, ['-P', '16', '-f', '4', unalignedApk, alignedApk], { env, stdio: 'inherit' });

const keystorePath = join(buildWork, 'debug.keystore');
const finalApk = join(apkOutDir, 'MealPlanner-debug.apk');

if (hasJdk) {
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
} else {
  console.log('8-9. Copying 16 KB page-aligned APK to output directory...');
  copyFileSync(alignedApk, finalApk);
}

copyFileSync(finalApk, join(rootDir, 'MealPlanner.apk'));
console.log(`SUCCESS! Built Android APK at:\n - ${finalApk}\n - ${join(rootDir, 'MealPlanner.apk')}`);
