import { createFileRoute, Navigate } from "@tanstack/react-router";
import { RotateCcw, Shuffle, Star } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { BookCarousel } from "@/components/book-carousel";
import { BookRating } from "@/components/book-row";
import { BookTile } from "@/components/book-tile";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { useActiveUser } from "@/hooks/use-users";
import { appData } from "@/lib/app-data";
import { useLibrary } from "@/hooks/use-library";
import { useSettings } from "@/hooks/use-settings";
import { visibleHomeSections } from "@/lib/home-sections";
import { continueReading } from "@/lib/continue-reading";
import { pickRandomFavorites, topRated } from "@/lib/home-favorites";
import { pickRandomUnread, resolveDrawn } from "@/lib/home-picks";
import { recentlyAdded } from "@/lib/recent-books";
import {
  isLowRated,
  lowestRated,
  pickRandomLowRated,
} from "@/lib/second-chance";
import type { LibraryEntry } from "@/shared/library";
import type { HomeSection } from "@/shared/settings";
import type { ResolvedHomeSection } from "@/lib/home-sections";

export const Route = createFileRoute("/")({
  component: HomePage,
});

/**
 * The page shown when the app starts: the blocks chosen in Paramètres › Accueil, in their order.
 * With the home page turned off it sends to the library instead. The blocks are keyed by the active
 * user too, so a switch of user remounts them: nothing a block kept (a draw, a dialog) outlives
 * the user it was made for.
 */
function HomePage() {
  const { t } = useTranslation("home");
  const { settings } = useSettings();
  const user = useActiveUser();
  if (!settings.homeEnabled) return <Navigate to="/library" replace />;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{user ? t("welcome", { nickname: user.nickname }) : t("title")}</h1>
      {visibleHomeSections(settings.homeSections).map((section) => {
        const Section = SECTION_VIEWS[section.id];
        return <Section key={`${user?.id}:${section.id}`} section={section} />;
      })}
    </div>
  );
}

/** The heading of a home block, with an optional icon-only button (to draw a new selection) beside it. */
function SectionHeader({
  id,
  title,
  action,
}: {
  id: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <h2 id={id} className="text-lg font-medium">
        {title}
      </h2>
      {action}
    </div>
  );
}

/** The icon-only button of a block that can draw another selection. */
function ShuffleButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Shuffle />
    </Button>
  );
}

/**
 * A block's draw, kept by id until its button draws another one. It is dropped while the library is
 * not loaded, which is how the data store announces a switch of user (it empties the library before
 * loading the new user's): the new user's library may arrive before the switch remounts the block,
 * and must not be shown through the previous user's draw.
 */
function useKeptDraw(
  library: LibraryEntry[] | null,
): [string[] | null, (ids: string[]) => void] {
  const [drawn, setDrawn] = useState<string[] | null>(null);
  if (!library && drawn) setDrawn(null);
  return [drawn, setDrawn];
}

/** The component drawing each home block. */
const SECTION_VIEWS: Record<
  HomeSection,
  (props: { section: ResolvedHomeSection }) => ReactNode
> = {
  continueReading: ContinueReading,
  recentlyAdded: RecentlyAdded,
  favorites: Favorites,
  suggestions: Suggestions,
  secondChance: SecondChance,
};

/** The books started and not finished, to resume; nothing when there are none. */
function ContinueReading({ section }: { section: ResolvedHomeSection }) {
  const { t } = useTranslation("home");
  const library = useLibrary();
  const { confirm, dialog } = useConfirm();
  const books = library ? continueReading(library, section.count) : [];
  if (!library || (books.length === 0 && section.hideWhenEmpty)) return null;

  // Back to page 0: the book leaves the block; its completion date (the "read" mark) is kept.
  const reset = async (entry: LibraryEntry) => {
    const confirmed = await confirm({
      title: t("resetProgress.title"),
      message: t("resetProgress.message", { title: entry.title }),
      action: t("resetProgress.confirm"),
    });
    if (!confirmed) return;
    void appData
      .patchEntry(entry.id, { currentPage: 0 }, () =>
        window.tankobon.library.updateProgress(entry.id, 0),
      )
      .catch(() => undefined);
  };

  return (
    <section className="mt-6" aria-labelledby="continue-reading">
      <SectionHeader id="continue-reading" title={t("continueReading")} />
      {books.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("continueReadingEmpty")}
        </p>
      ) : (
        <BookCarousel layout={section.layout}>
          {books.map((entry) => (
            <BookTile
              key={entry.id}
              entry={entry}
              extra={
                <span className="block text-xs text-muted-foreground">
                  {t("continueReadingPage", {
                    page: entry.currentPage + 1,
                    total: entry.pageCount,
                  })}
                </span>
              }
              action={
                <Button
                  variant="secondary"
                  size="icon-sm"
                  className="shadow"
                  onClick={() => void reset(entry)}
                  aria-label={t("resetProgress.action")}
                  title={t("resetProgress.action")}
                >
                  <RotateCcw />
                </Button>
              }
            />
          ))}
        </BookCarousel>
      )}
      {dialog}
    </section>
  );
}

/** The books most recently added to the library. */
function RecentlyAdded({ section }: { section: ResolvedHomeSection }) {
  const { t } = useTranslation("home");
  const library = useLibrary();
  const recent = useMemo(
    () => (library ? recentlyAdded(library, section.count) : []),
    [library, section.count],
  );
  if (!library || (recent.length === 0 && section.hideWhenEmpty)) return null;
  return (
    <>
      <section className="mt-6" aria-labelledby="recently-added">
        <SectionHeader id="recently-added" title={t("recentlyAdded")} />
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("recentlyAddedEmpty")}
          </p>
        ) : (
          <BookCarousel layout={section.layout}>
            {recent.map((entry) => (
              <BookTile key={entry.id} entry={entry} />
            ))}
          </BookCarousel>
        )}
      </section>
    </>
  );
}

/**
 * The best-rated books, until the button draws another selection among the well-rated ones; the
 * draw is kept (by id) so a change in the store doesn't reshuffle the block. Nothing while none is rated.
 */
function Favorites({ section }: { section: ResolvedHomeSection }) {
  const { t } = useTranslation("home");
  const library = useLibrary();
  const [drawn, setDrawn] = useKeptDraw(library);
  const favorites = useMemo(() => {
    if (!library) return [];
    return drawn
      ? resolveDrawn(library, drawn)
      : topRated(library, section.count);
  }, [library, section.count, drawn]);
  if (!library || (favorites.length === 0 && section.hideWhenEmpty))
    return null;
  return (
    <section className="mt-6" aria-labelledby="home-favorites">
      <SectionHeader
        id="home-favorites"
        title={t("favorites.title")}
        action={
          <ShuffleButton
            label={t("favorites.shuffle")}
            onClick={() =>
              setDrawn(
                pickRandomFavorites(library, section.count).map(
                  (entry) => entry.id,
                ),
              )
            }
          />
        }
      />
      {favorites.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("favorites.empty")}
        </p>
      ) : (
        <BookCarousel layout={section.layout}>
          {favorites.map((entry) => (
            <BookTile
              key={entry.id}
              entry={entry}
              extra={
                <span
                  className="mt-0.5 flex gap-0.5"
                  role="img"
                  aria-label={t("favorites.rating", { rating: entry.rating })}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      className={`size-3.5 ${value <= entry.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                      aria-hidden
                    />
                  ))}
                </span>
              }
            />
          ))}
        </BookCarousel>
      )}
    </section>
  );
}

/**
 * Random unread books. The draw is made once the library is loaded and kept until the
 * button redraws it, so a rating or a tag changing in the store doesn't reshuffle the block.
 */
function Suggestions({ section }: { section: ResolvedHomeSection }) {
  const { t } = useTranslation("home");
  const library = useLibrary();
  const [drawn, setDrawn] = useKeptDraw(library);

  if (!library) return null;
  const draw = () =>
    pickRandomUnread(library, section.count).map((entry) => entry.id);
  const ids = drawn ?? draw();
  if (!drawn) setDrawn(ids);
  // Keep the books' latest state (progress, tags) while the selection itself stays put.
  const shown = resolveDrawn(library, ids);
  if (shown.length === 0 && section.hideWhenEmpty) return null;

  return (
    <section className="mt-6" aria-labelledby="home-suggestions">
      <SectionHeader
        id="home-suggestions"
        title={t("suggestions.title")}
        action={
          <ShuffleButton
            label={t("suggestions.shuffle")}
            onClick={() => setDrawn(draw())}
          />
        }
      />
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("suggestions.empty")}
        </p>
      ) : (
        <BookCarousel layout={section.layout}>
          {shown.map((entry) => (
            <BookTile key={entry.id} entry={entry} />
          ))}
        </BookCarousel>
      )}
    </section>
  );
}

/**
 * The lowest-rated books, as covers like the other blocks, with their rating editable in place; the
 * button draws another selection among all the poorly rated ones (kept by id until the next draw).
 */
function SecondChance({ section }: { section: ResolvedHomeSection }) {
  const { t } = useTranslation("home");
  const library = useLibrary();
  const [drawn, setDrawn] = useKeptDraw(library);
  const entries = useMemo(() => {
    if (!library) return [];
    // A book whose rating was raised meanwhile leaves the block.
    return drawn
      ? resolveDrawn(library, drawn, isLowRated)
      : lowestRated(library, section.count);
  }, [library, section.count, drawn]);

  if (!library || (entries.length === 0 && section.hideWhenEmpty)) return null;
  return (
    <section className="mt-6" aria-labelledby="second-chance">
      <SectionHeader
        id="second-chance"
        title={t("secondChance.title")}
        action={
          <ShuffleButton
            label={t("secondChance.shuffle")}
            onClick={() =>
              setDrawn(
                pickRandomLowRated(library, section.count).map(
                  (entry) => entry.id,
                ),
              )
            }
          />
        }
      />
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("secondChance.empty")}
        </p>
      ) : (
        <BookCarousel layout={section.layout}>
          {entries.map((entry) => (
            <BookTile
              key={entry.id}
              entry={entry}
              footer={
                <div className="mt-1">
                  <BookRating entry={entry} />
                </div>
              }
            />
          ))}
        </BookCarousel>
      )}
    </section>
  );
}
