import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  Animation,
  AnimationFramePair,
  Character,
  Character2,
  ImageAnimation,
  Item,
  RawGeneration,
  RawVideoGeneration,
  VideoAnimation,
} from '../types'

interface SpriteDashboardDB extends DBSchema {
  characters: { key: string; value: Character }
  characters2: { key: string; value: Character2 }
  rawGenerations: { key: string; value: RawGeneration; indexes: { kind: string } }
  items: { key: string; value: Item }
  rawVideoGenerations: { key: string; value: RawVideoGeneration }
  animations: { key: string; value: Animation; indexes: { characterId: string } }
  imageAnimations: { key: string; value: ImageAnimation; indexes: { characterId: string } }
  animationFramePairs: { key: string; value: AnimationFramePair; indexes: { characterId: string } }
  videoAnimations: { key: string; value: VideoAnimation; indexes: { characterId: string } }
}

let dbPromise: Promise<IDBPDatabase<SpriteDashboardDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SpriteDashboardDB>('sprite-dashboard', 10, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('characters')) {
          db.createObjectStore('characters', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('characters2')) {
          db.createObjectStore('characters2', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('rawGenerations')) {
          const rawGenerations = db.createObjectStore('rawGenerations', { keyPath: 'id' })
          rawGenerations.createIndex('kind', 'kind')
        }
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('rawVideoGenerations')) {
          db.createObjectStore('rawVideoGenerations', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('animations')) {
          const animations = db.createObjectStore('animations', { keyPath: 'id' })
          animations.createIndex('characterId', 'characterId')
        }
        if (!db.objectStoreNames.contains('imageAnimations')) {
          const imageAnimations = db.createObjectStore('imageAnimations', { keyPath: 'id' })
          imageAnimations.createIndex('characterId', 'characterId')
        }
        if (!db.objectStoreNames.contains('animationFramePairs')) {
          const animationFramePairs = db.createObjectStore('animationFramePairs', { keyPath: 'id' })
          animationFramePairs.createIndex('characterId', 'characterId')
        }
        if (!db.objectStoreNames.contains('videoAnimations')) {
          const videoAnimations = db.createObjectStore('videoAnimations', { keyPath: 'id' })
          videoAnimations.createIndex('characterId', 'characterId')
        }
      },
    })
  }
  return dbPromise
}

export async function saveCharacter(character: Character): Promise<void> {
  const db = await getDB()
  await db.put('characters', character)
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  const db = await getDB()
  return db.get('characters', id)
}

export async function listCharacters(): Promise<Character[]> {
  const db = await getDB()
  return db.getAll('characters')
}

export async function saveCharacter2(character: Character2): Promise<void> {
  const db = await getDB()
  await db.put('characters2', character)
}

export async function getCharacter2(id: string): Promise<Character2 | undefined> {
  const db = await getDB()
  return db.get('characters2', id)
}

export async function listCharacters2(): Promise<Character2[]> {
  const db = await getDB()
  return db.getAll('characters2')
}

export async function saveRawGeneration(generation: RawGeneration): Promise<void> {
  const db = await getDB()
  await db.put('rawGenerations', generation)
}

export async function listRawGenerations(kind: RawGeneration['kind']): Promise<RawGeneration[]> {
  const db = await getDB()
  return db.getAllFromIndex('rawGenerations', 'kind', kind)
}

export async function saveItem(item: Item): Promise<void> {
  const db = await getDB()
  await db.put('items', item)
}

export async function listItems(): Promise<Item[]> {
  const db = await getDB()
  return db.getAll('items')
}

export async function saveRawVideoGeneration(generation: RawVideoGeneration): Promise<void> {
  const db = await getDB()
  await db.put('rawVideoGenerations', generation)
}

export async function listRawVideoGenerations(): Promise<RawVideoGeneration[]> {
  const db = await getDB()
  return db.getAll('rawVideoGenerations')
}

export async function saveAnimation(animation: Animation): Promise<void> {
  const db = await getDB()
  await db.put('animations', animation)
}

export async function listAnimationsForCharacter(characterId: string): Promise<Animation[]> {
  const db = await getDB()
  return db.getAllFromIndex('animations', 'characterId', characterId)
}

export async function saveImageAnimation(animation: ImageAnimation): Promise<void> {
  const db = await getDB()
  await db.put('imageAnimations', animation)
}

export async function listImageAnimationsForCharacter(characterId: string): Promise<ImageAnimation[]> {
  const db = await getDB()
  return db.getAllFromIndex('imageAnimations', 'characterId', characterId)
}

export async function saveFramePair(pair: AnimationFramePair): Promise<void> {
  const db = await getDB()
  await db.put('animationFramePairs', pair)
}

export async function listFramePairsFor(
  characterId: string,
  itemIds: string[],
  state: AnimationFramePair['state'],
): Promise<AnimationFramePair[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('animationFramePairs', 'characterId', characterId)
  const sameItems = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i])
  return all.filter((p) => p.state === state && sameItems(p.itemIds, itemIds))
}

export async function saveVideoAnimation(animation: VideoAnimation): Promise<void> {
  const db = await getDB()
  await db.put('videoAnimations', animation)
}

export async function listVideoAnimationsForCharacter(characterId: string): Promise<VideoAnimation[]> {
  const db = await getDB()
  return db.getAllFromIndex('videoAnimations', 'characterId', characterId)
}

export async function listRawVideoGenerationsByKind(
  kind: NonNullable<RawVideoGeneration['kind']>,
): Promise<RawVideoGeneration[]> {
  const all = await listRawVideoGenerations()
  return all.filter((g) => (g.kind ?? 'grid_2x2') === kind)
}

export async function listAnimationGroups(): Promise<string[]> {
  const db = await getDB()
  const [animations, imageAnimations, videoAnimations] = await Promise.all([
    db.getAll('animations'),
    db.getAll('imageAnimations'),
    db.getAll('videoAnimations'),
  ])
  const groups = new Set<string>()
  for (const a of animations) if (a.groupName) groups.add(a.groupName)
  for (const a of imageAnimations) if (a.groupName) groups.add(a.groupName)
  for (const a of videoAnimations) if (a.groupName) groups.add(a.groupName)
  return Array.from(groups).sort()
}
