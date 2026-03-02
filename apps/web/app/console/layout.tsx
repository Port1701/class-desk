import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Console | ClassDesk',
};

const ConsoleLayout = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export default ConsoleLayout;
