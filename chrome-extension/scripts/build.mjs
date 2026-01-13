#!/usr/bin/env node

/**
 * Chrome Extension 빌드 스크립트
 * - 불필요한 파일(.sh, .DS_Store 등)을 제외하고 zip 파일 생성
 * - build 폴더에 결과물 저장
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 경로 설정
const extensionDir = resolve(__dirname, '..');
const projectRoot = resolve(extensionDir, '..');
const buildDir = join(projectRoot, 'chrome-extension/build');

// manifest.json에서 버전 읽기
const manifestPath = join(extensionDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const version = manifest.version;

// 빌드 폴더 생성
if (existsSync(buildDir)) {
  rmSync(buildDir, { recursive: true });
}
mkdirSync(buildDir, { recursive: true });

// zip 파일명
const zipFileName = `schedule-ai-extension-v${version}.zip`;
const zipFilePath = join(buildDir, zipFileName);

console.log('');
console.log('🔨 Chrome Extension 빌드 시작');
console.log('================================');
console.log(`📦 버전: ${version}`);
console.log(`📁 소스: ${extensionDir}`);
console.log(`📁 출력: ${buildDir}`);
console.log('');

// 제외할 파일 패턴
const excludePatterns = [
  '*.sh',           // 쉘 스크립트
  '.DS_Store',      // macOS 시스템 파일
  '*.git*',         // git 관련
  'scripts/*',      // 빌드 스크립트 폴더
  'package.json',   // npm 설정
  'node_modules/*', // 의존성
];

// zip 명령어 생성
const excludeArgs = excludePatterns.map(p => `-x "${p}"`).join(' ');
const zipCommand = `cd "${extensionDir}" && zip -r "${zipFilePath}" . ${excludeArgs}`;

try {
  console.log('📦 Zip 파일 생성 중...');
  execSync(zipCommand, { stdio: 'inherit' });
  
  console.log('');
  console.log('✅ 빌드 완료!');
  console.log(`📦 출력 파일: ${zipFilePath}`);
  console.log('');
  
  // zip 파일 내용 확인
  console.log('📋 포함된 파일 목록:');
  console.log('-------------------');
  execSync(`unzip -l "${zipFilePath}"`, { stdio: 'inherit' });
  
} catch (error) {
  console.error('❌ 빌드 실패:', error.message);
  process.exit(1);
}
