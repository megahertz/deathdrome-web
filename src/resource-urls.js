// Explicit resource URLs also work on LAN HTTP, where service workers are unavailable.
let urls=null;
export function resourceURL(path){if(!urls)return path;const key=path.replace(/^\.?\/?assets\//,'').split('?')[0];return urls.get(key)||'data:application/octet-stream,'}
export function useResourceURLs(files,{createURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url)}={}){
 if(urls)for(const url of urls.values())revokeURL(url);
 urls=files?new Map(files.map(({path,data})=>[path,createURL(data)])):null;
}
