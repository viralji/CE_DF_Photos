import NextAuth from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

const allowedDomain = process.env.ALLOWED_DOMAIN || 'cloudextel.com';

export const authOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  callbacks: {
    signIn({ user }: { user?: { email?: string | null } }) {
      const email = user?.email;
      if (!email) return false;
      const domain = email.split('@')[1]?.toLowerCase();
      return domain === allowedDomain;
    },
  },
  pages: {
    signIn: '/signin',
  },
};

const handler = NextAuth(authOptions);
export { handler };
