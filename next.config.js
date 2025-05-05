/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  trailingSlash: true,
  modularizeImports: {
    '@mui/material': {
      transform: '@mui/material/{{member}}',
    },
    '@mui/lab': {
      transform: '@mui/lab/{{member}}',
    },
  },
  transpilePackages: ['lucide-react'],
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:5328/api/:path*',
      },
    ]
  },
  experimental: {
    proxyTimeout: 120 * 1000,
  },
  webpackDevMiddleware: config => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    }
    return config
  }
  // api: {
  //   bodyParser: {
  //     sizeLimit: '20mb',
  //   },
  // },
}

module.exports = nextConfig
