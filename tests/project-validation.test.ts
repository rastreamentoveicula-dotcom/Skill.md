import {describe,expect,it} from 'vitest';
import {projectInput} from '../lib/project-validation';
import {PayloadTooLargeError,readJsonLimited} from '../lib/read-json';
const valid={id:'c85ef8b6-c846-4fdb-98b8-2297f7d830e3',name:'Projeto',aspect:'16:9',scenes:[{id:'8b6c5c82-6416-4f09-9d1c-411a69a47763',title:'Cena',description:'',duration:4,color:'#6548bb'}],characters:[]};
describe('project API validation',()=>{
  it('accepts a valid project snapshot and rejects invalid ids or dimensions',()=>{
    expect(projectInput.safeParse(valid).success).toBe(true);
    expect(projectInput.safeParse({...valid,id:'not-a-uuid'}).success).toBe(false);
    expect(projectInput.safeParse({...valid,aspect:'21:9'}).success).toBe(false);
    expect(projectInput.safeParse({...valid,scenes:[]}).success).toBe(false);
  });
  it('reads bounded JSON and refuses oversized requests before parsing',async()=>{
    const request=new Request('https://example.invalid/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ok:true})});
    await expect(readJsonLimited(request,64)).resolves.toEqual({ok:true});
    const huge=new Request('https://example.invalid/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:'x'.repeat(80)})});
    await expect(readJsonLimited(huge,32)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });
});
