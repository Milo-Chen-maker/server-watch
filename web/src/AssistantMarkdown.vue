<script setup lang="ts">
import {defineComponent,h} from 'vue';
import MarkdownRender,{setCustomComponents,disableKatex,disableMermaid,disableD2,disableInfographic} from 'markstream-vue';
import 'markstream-vue/index.css';
import AssistantCodeBlock from './AssistantCodeBlock.vue';
defineProps<{content:string;final:boolean}>();
disableKatex();disableMermaid();disableD2();disableInfographic();
const ImageLabel=defineComponent({props:{node:{type:Object,required:true}},setup:props=>()=>h('span',{class:'chat-image-label'},`[图片：${props.node.alt||'图片'}]`)});
setCustomComponents('server-watch-chat',{code_block:AssistantCodeBlock,image:ImageLabel});
const parseOptions={validateLink:(url:string)=>/^(https?:\/\/|mailto:|#)/i.test(url)};
</script>
<template><MarkdownRender class="chat-markdown" custom-id="server-watch-chat" mode="chat" :content="content" :final="final" html-policy="escape" :parse-options="parseOptions" :smooth-streaming="false" :fade="false" :typewriter="false" :node-virtual="false" :viewport-priority="false"/></template>
<style scoped>
.chat-markdown{font-size:15px;line-height:1.85;overflow-wrap:anywhere;color:#27384c;min-width:0;width:100%}.chat-markdown :deep(h1){font-size:23px}.chat-markdown :deep(h2){font-size:19px}.chat-markdown :deep(h3){font-size:16px}.chat-markdown :deep(h1),.chat-markdown :deep(h2),.chat-markdown :deep(h3){margin:20px 0 10px;font-weight:650;line-height:1.5}.chat-markdown :deep(p){margin:8px 0}.chat-markdown :deep(ul),.chat-markdown :deep(ol){padding-left:24px;margin:8px 0}.chat-markdown :deep(li){margin:4px 0}.chat-markdown :deep(table){font-size:13px;border-collapse:collapse;white-space:nowrap}.chat-markdown :deep(th),.chat-markdown :deep(td){padding:8px 12px;border:1px solid #e1e7ef}.chat-markdown :deep(th){background:#f4f7fb;font-weight:600}.chat-markdown :deep(blockquote){margin:12px 0;padding:8px 14px;border-left:3px solid #a5bbda;background:#f6f8fc}.chat-markdown :deep(a){color:#2c5ea8}.chat-markdown :deep(.table-container){overflow:auto;max-width:100%}.chat-markdown :deep(code){font-size:.88em}.chat-markdown :deep(.chat-image-label){color:#7b889a;font-size:13px}
</style>
