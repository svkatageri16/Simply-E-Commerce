import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AikyamGlobalFooter } from '../components/AikyamGlobalFooter';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { AdminThemeProvider } from '../context/AdminThemeContext';
import { AdminAttentionProvider } from '../context/AdminAttentionContext';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const standalone = ['/login', '/activate', '/change-password', '/_error'].includes(router.pathname);
  return (
    <AdminThemeProvider>
      <AdminAuthProvider>
        <AdminAttentionProvider>
          <Head>
            <title>LetzShop Admin</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
          </Head>
          <Component {...pageProps} />
          <AikyamGlobalFooter className={standalone ? '' : 'md:pl-60'} />
        </AdminAttentionProvider>
      </AdminAuthProvider>
    </AdminThemeProvider>
  );
}
