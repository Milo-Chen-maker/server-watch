import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:'web',base:'/console/',plugins:[vue()],build:{outDir:'../public/console',emptyOutDir:true}});
