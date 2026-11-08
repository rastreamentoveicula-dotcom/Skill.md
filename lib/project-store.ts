import { starterProject, type StudioProject } from './types';
const KEY = 'recriar-motion-project-v1';
export function loadProject(): StudioProject {
  if (typeof window === 'undefined') return starterProject;
  try { const data = window.localStorage.getItem(KEY); if(!data)return starterProject;const project=JSON.parse(data) as StudioProject;return {...project,characters:(project.characters??[]).map(character=>({...character,personality:character.personality??''}))}; } catch { return starterProject; }
}
export function saveProject(project: StudioProject) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify({ ...project, updatedAt: new Date().toISOString() }));
}
