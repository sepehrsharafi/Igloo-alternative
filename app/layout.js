import './globals.css';

export const metadata = {
  title: 'Igloo — Written Block by Block',
  description: 'A procedural 3D shelter assembled from 163 interactive blocks.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#dce8eb',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
