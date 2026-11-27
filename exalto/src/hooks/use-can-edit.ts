import { useAuth } from '@/context/auth-context';
import { useHymnals, type Hymnal } from '@/data/hymnals';

/**
 * Who can edit what (mirrors admin/firestore.rules): owners, admins and editors edit every hymnal and hymn;
 * composers edit only the community hymnals they own (`ownerUid`) and their own hymns in them.
 */
export function useCanEdit() {
  const { user, canEditAll, isComposer } = useAuth();
  const uid = user?.uid;
  return {
    /** Can create hymnals (and add hymns to the ones they may edit). */
    canCreate: canEditAll || isComposer,
    hymnal: (h?: Pick<Hymnal, 'ownerUid'> | null) => Boolean(h && (canEditAll || (isComposer && uid && h.ownerUid === uid))),
    hymn: (h?: { ownerUid?: string; hymnalId?: string } | null, hymnal?: Pick<Hymnal, 'ownerUid'> | null) =>
      Boolean(h && (canEditAll || (isComposer && uid && h.ownerUid === uid && hymnal?.ownerUid === uid))),
  };
}

/** The hymnals this person may put hymns in. */
export function useEditableHymnals() {
  const hymnals = useHymnals();
  const can = useCanEdit();
  return hymnals.filter((h) => can.hymnal(h));
}
