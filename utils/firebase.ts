import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Config pública do Firebase (não é segredo — a segurança é feita pelas
// regras do Firestore, não por esconder essas chaves do cliente).
const firebaseConfig = {
  apiKey: 'AIzaSyCeb4XBZcURQgQMn1BQO24fHCBt1FsXMn4',
  authDomain: 'snpp-e4186.firebaseapp.com',
  projectId: 'snpp-e4186',
  storageBucket: 'snpp-e4186.firebasestorage.app',
  messagingSenderId: '643770921851',
  appId: '1:643770921851:web:25254d0a37d33e865383de',
};

const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
