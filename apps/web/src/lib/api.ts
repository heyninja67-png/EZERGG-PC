const API_URL = '/api/v1'
const TOKEN_KEY = 'ezergg_access_token'

export type User = { id: string; email: string; display_name: string; is_admin: boolean }
export type CloudPC = {
  id: string; name: string; os_image: string; cpu_cores: number; ram_gb: number;
  storage_gb: number; gpu_sku: string; storage_volume_id?: string | null; status: string; provider_name: string;
  is_demo: boolean; last_error: string | null; created_at: string; updated_at: string
}
export type CapacityItem = { id: string; label: string; available: boolean; verified: boolean; details?: string | null }
export type Capacity = {
  mode: string; verified: boolean; region: string; cpu_profiles: number[]; ram_profiles: number[];
  storage_profiles: number[]; os_images: string[]; gpu_profiles: CapacityItem[]; message: string
}

export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function saveToken(token: string) { localStorage.setItem(TOKEN_KEY, token) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error(`Não foi possível alcançar a API. Verifique se o backend está em execução.`)
  }
  if (!response.ok) {
    let message = `Erro ${response.status}`
    try {
      const body = await response.json()
      message = typeof body.detail === 'string' ? body.detail : message
    } catch { /* resposta sem JSON */ }
    if (response.status === 401) clearToken()
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  register: (data: { email: string; display_name: string; password: string }) => request<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) => request<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<User>('/auth/me'),
  capacity: () => request<Capacity>('/capacity'),
  listPCs: () => request<CloudPC[]>('/cloud-pcs'),
  createPC: (data: { name: string; os_image: string; cpu_cores: number; ram_gb: number; storage_gb: number; gpu_sku: string }) => request<CloudPC>('/cloud-pcs', { method: 'POST', body: JSON.stringify(data) }),
  startPC: (id: string) => request<CloudPC>(`/cloud-pcs/${id}/start`, { method: 'POST' }),
  stopPC: (id: string) => request<CloudPC>(`/cloud-pcs/${id}/stop`, { method: 'POST' }),
  restartPC: (id: string) => request<CloudPC>(`/cloud-pcs/${id}/restart`, { method: 'POST' }),
  connectPC: (id: string) => request<{ connected: boolean; stream_url: string | null; message: string }>(`/cloud-pcs/${id}/connect`, { method: 'POST' }),
  deletePC: (id: string) => request<void>(`/cloud-pcs/${id}`, { method: 'DELETE' }),
}
