import { Link } from '@tanstack/react-router';

import { cn } from '@/lib/utils';
import type { Credit } from '@/shared/library';
import { formatPersonName } from '@/shared/title-parsing';

/**
 * The name of a credited person as a link to their page (`/authors/$personId`). It sits inside rows
 * that open the book on click, so the click is kept from reaching them: following the link never
 * opens the reader.
 */
export function AuthorLink({ person, className }: { person: Pick<Credit, 'personId' | 'firstName' | 'lastName'>; className?: string }) {
  return (
    <Link
      to="/authors/$personId"
      params={{ personId: person.personId }}
      onClick={(event) => event.stopPropagation()}
      className={cn('cursor-pointer hover:underline', className)}
    >
      {formatPersonName(person)}
    </Link>
  );
}
