// 가벼운 래퍼: react-native-passkeys(또는 동등 라이브러리) 존재 시 사용
// 라이브러리 미설치 환경에서도 타입 에러 없이 빌드되도록 동적 require 사용
type AnyModule = any;

let PasskeyModule: AnyModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PasskeyModule = require('react-native-passkeys');
} catch (e) {
  PasskeyModule = null;
}

 

export const hasPasskeySupport = () => !!PasskeyModule;

export async function createPasskey(options: any) {
  if (!PasskeyModule) throw new Error('Passkey module not installed');
  return PasskeyModule.create(options);
}

export async function getPasskeyAssertion(options: any) {
  if (!PasskeyModule) throw new Error('Passkey module not installed');
  return PasskeyModule.get(options);
}

 


