import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { CartProvider } from '../context/CartContext';
import { ToastProvider } from '../components/ui/Toast';
import { StorefrontLocaleProvider } from '@simply/i18n';
import '../styles/globals.css';
import { PreviewNavigationBridge } from '../components/PreviewNavigationBridge';
import { AikyamGlobalFooter } from '../components/AikyamGlobalFooter';

function StorefrontAppLocaleWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const slug =
    typeof router.query.slug === 'string'
      ? router.query.slug
      : router.asPath.startsWith('/store/')
      ? router.asPath.split('/')[2]?.split('?')[0] || ''
      : '';

  if (router.asPath.startsWith('/store/')) {
    return (
      <StorefrontLocaleProvider storeSlug={slug}>
        {children}
      </StorefrontLocaleProvider>
    );
  }
  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  return (
    <CartProvider>
      <StorefrontAppLocaleWrapper>
        <ToastProvider>
          <Head>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            <link rel="manifest" href="/manifest.json" />
          </Head>
          <Component {...pageProps} />
          <AikyamGlobalFooter theme={router.pathname.startsWith('/store/') || router.pathname.startsWith('/track/') ? 'dark' : 'subtle'} />
          <PreviewNavigationBridge />
        </ToastProvider>
      </StorefrontAppLocaleWrapper>
    </CartProvider>
  );
}
