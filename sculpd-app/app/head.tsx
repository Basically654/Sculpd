import React from "react";

export default function Head() {
  return (
    <>
      <meta name="theme-color" content="#000000" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta
        name="apple-mobile-web-app-status-bar-style"
        content="black-translucent"
      />
      <link rel="manifest" href="/manifest.json" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="icon" href="/icon.png" />
      <link rel="mask-icon" href="/icon.svg" color="#000000" />
      <link
        rel="apple-touch-startup-image"
        href="/apple-splash-2048x2732.png"
      />
    </>
  );
}
