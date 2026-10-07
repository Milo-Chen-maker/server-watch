<script setup lang="ts">
import {copyText as copyChatText} from './clipboard';
import {ElMessage} from 'element-plus';
defineProps<{node:{code:string;language?:string;loading?:boolean}}>();
async function copy(text:string){try{await copyChatText(text);ElMessage.success('代码已复制');}catch{ElMessage.info('无法自动复制，请选中代码复制');}}
</script>
<template><div class="chat-code"><div class="chat-code-header"><span>{{node.language||'文本'}}</span><el-button link size="small" :disabled="!node.code" @click="copy(node.code)">复制代码</el-button></div><pre><code>{{node.code}}</code></pre></div></template>
<style scoped>
.chat-code{margin:14px 0;border:1px solid #dfe5ed;border-radius:8px;overflow:hidden;background:#f7f9fc;max-width:100%}.chat-code-header{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid #e5eaf1;font-size:12px;color:#68798f}.chat-code pre{margin:0;padding:14px;overflow:auto;max-height:380px;font-size:13px;line-height:1.7;white-space:pre}.chat-code code{white-space:pre}
</style>
