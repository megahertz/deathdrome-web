// 434c54 follows +58/+5c PARENT links, newest parent first. In contrast,
// 44b47c follows +68/+6c children. 45a3dc/44b760 installs both directions.
export function findContactNode(node,prefix){
 if(!node)return null;if(node.name.startsWith(prefix))return node;
 for(let i=(node.parents?.length??0)-1;i>=0;i--){let found=findContactNode(node.parents[i],prefix);if(found)return found}
 return null;
}

// A decoded facet path currently supplies one ancestor chain. The hit belongs
// to the containing shape, not its polygon or the outermost arena node.
// Native loader pruning, detached world nodes and multiple parents are separate.
export function contactNodeFromPath(path){
 const parts=path.split('/');if(parts.length>1)parts.pop();let node=null;
 for(const name of parts)node={name,parents:node?[node]:[]};return node;
}
