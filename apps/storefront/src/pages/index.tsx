import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { fetchLaunchPlan, LaunchPlan } from '../utils/launch-plan';
import { getSellerUrl } from '../utils/config';
import { LandingLocaleProvider, useLandingI18n } from '@simply/i18n';
import { LandingNavbar } from '../components/landing/LandingNavbar';
import { Screen1Hero } from '../components/landing/Screen1Hero';
import { Screen2Problem } from '../components/landing/Screen2Problem';
import { Screen3System } from '../components/landing/Screen3System';
import { Screen4Categories } from '../components/landing/Screen4Categories';
import { Screen5CustomerJourney } from '../components/landing/Screen5CustomerJourney';
import { Screen7Pricing } from '../components/landing/Screen7Pricing';
import { Screen8StepsFaqCta } from '../components/landing/Screen8StepsFaqCta';
import { LandingFooter } from '../components/landing/LandingFooter';

/**
 * LetZshop Public Landing Page (Root `/`)
 * Clean, modern white/warm-white visual identity with blue & orange branding.
 */
interface LandingPageProps {
  initialLaunchPlan: LaunchPlan | null;
  initialSellerUrl: string;
  sellerOriginConfigured: boolean;
}

function LandingPageInner({ initialSellerUrl, sellerOriginConfigured, initialLaunchPlan }: LandingPageProps) {
  // Serialize the same initial origin into server HTML and the first browser render.
  const [sellerUrl, setSellerUrl] = useState(initialSellerUrl);

  useEffect(() => {
    setSellerUrl(sellerOriginConfigured ? initialSellerUrl : getSellerUrl());
  }, [initialSellerUrl, sellerOriginConfigured]);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between font-sans antialiased selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      <Head>
        <title>LetZshop — Build the Online Store Your Brand Deserves | letzshop.store</title>
        <meta
          name="description"
          content="Create a beautiful branded ecommerce store, showcase products, accept payments, manage orders and sell through a professional online storefront — with the Launch plan on LetZshop."
        />
        <meta property="og:title" content="LetZshop — Build the Online Store Your Brand Deserves" />
        <meta
          property="og:description"
          content="Branded storefront, UPI payments, WhatsApp commerce, and connected order management for Indian merchants on LetZshop."
        />
        <meta property="og:type" content="website" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Navigation Header */}
      <LandingNavbar sellerUrl={sellerUrl} />

      {/* Main Content */}
      <main data-landing-main className="flex-1 w-full overflow-x-hidden">
        {/* Screen 1: Hero */}
        <Screen1Hero sellerUrl={sellerUrl} />

        {/* Screen 2: The Merchant Problem */}
        <Screen2Problem />

        {/* Screen 3: One Store, One System */}
        <Screen3System />

        {/* Screen 4: Your Business Goes Online (Interactive Category Showcase) */}
        <Screen4Categories />

        {/* Screen 5: Customer Visit to Delivery */}
        <Screen5CustomerJourney />

        {/* Pricing replaces the former Brand Studio landing position. */}
        <Screen7Pricing sellerUrl={sellerUrl} initialPlan={initialLaunchPlan} />

        {/* Screen 8: How It Works + FAQ + Final CTA */}
        <Screen8StepsFaqCta sellerUrl={sellerUrl} />
      </main>

      {/* Footer */}
      <LandingFooter sellerUrl={sellerUrl} />
    </div>
  );
}

export async function getStaticProps() {
  return { revalidate: 300, props: {
    initialLaunchPlan: await fetchLaunchPlan(),
    initialSellerUrl: getSellerUrl(),
    sellerOriginConfigured: Boolean(process.env.NEXT_PUBLIC_SELLER_URL || process.env.SELLER_URL || process.env.SELLER_DASHBOARD_URL),
  } };
}

export default function PlatformLandingPage(props: LandingPageProps) {
  return (
    <LandingLocaleProvider>
      <LandingPageInner {...props} />
    </LandingLocaleProvider>
  );
}
