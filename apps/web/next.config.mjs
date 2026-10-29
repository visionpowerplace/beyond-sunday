/** @type {import('next').NextConfig} */
export default {
  // @bs/core is plain ESM source in the monorepo, not a built package.
  transpilePackages: ['@bs/core'],
  experimental: { serverActions: { bodySizeLimit: '2gb' } },
};
