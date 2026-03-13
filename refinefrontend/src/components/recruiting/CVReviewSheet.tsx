import { useState, useEffect, useMemo } from "react";
import {
  useOne,
  useList,
  useCreate,
  useUpdate,
  useInvalidate,
} from "@refinedev/core";
import { MentionsInput, Mention } from "react-mentions";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Ban,
  Download,
  Plus,
  Mail,
  Phone,
  GraduationCap,
  Briefcase,
  Linkedin,
  Tag,
} from "lucide-react";
import type { RecruitingItem } from "@/lib/recruiting-kanban";

interface CVReviewSheetProps {
  applicantId: string | null;
  screeningItems: RecruitingItem[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}

function formatCommentDate(creation: string) {
  const d = new Date(creation);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function toFrappeHTML(value: string): string {
  return value.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    (_, display, id) =>
      `<span class="mention" data-id="${id}" data-value="${display}" data-denotation-char="@">` +
      `<span class="ql-mention-denotation-char">@</span>${display}</span>`
  );
}

function renderCommentContent(content: string) {
  const processed = content.replace(
    /<span class="mention"[^>]*data-value="([^"]+)"[^>]*>[\s\S]*?<\/span>\s*<\/span>/g,
    '<mark class="text-primary font-medium bg-transparent">@$1</mark>'
  );
  const html = processed.replace(/<br\s*\/?>/gi, "\n");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const mentionInputStyle = {
  control: {
    fontSize: "14px",
    minHeight: "96px",
  },
  highlighter: {
    padding: "8px 12px",
    fontSize: "14px",
    fontFamily: "inherit",
    lineHeight: "1.5",
    minHeight: "80px",
    border: "1px solid transparent",
    boxSizing: "border-box" as const,
  },
  input: {
    padding: "8px 12px",
    border: "1px solid hsl(var(--input))",
    borderRadius: "6px",
    fontSize: "14px",
    outline: "none",
    minHeight: "80px",
    resize: "none" as const,
    width: "100%",
    fontFamily: "inherit",
    lineHeight: "1.5",
    boxSizing: "border-box" as const,
  },
  suggestions: {
    list: {
      backgroundColor: "hsl(var(--popover))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "6px",
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
      overflow: "hidden",
      zIndex: 50,
    },
    item: {
      padding: "6px 12px",
      fontSize: "14px",
      cursor: "pointer",
    },
  },
};

export function CVReviewSheet({
  applicantId,
  screeningItems,
  onClose,
  onNavigate,
}: CVReviewSheetProps) {
  const [commentValue, setCommentValue] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [applicantTags, setApplicantTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");

  const currentIdx = screeningItems.findIndex((i) => i.id === applicantId);

  // Fetch full applicant doc
  const { result: applicantResult } = useOne({
    resource: "Job Applicant",
    id: applicantId ?? "",
    queryOptions: { enabled: !!applicantId },
    meta: {
      fields: [
        "name",
        "applicant_name",
        "email_id",
        "phone_number",
        "job_title",
        "resume_attachment",
        "cover_letter",
        "custom_education_degree",
        "custom_education_institution",
        "custom_education_graduation_year",
        "custom_work_experience",
        "custom_linkedin_url",
        "_user_tags",
      ],
    },
  });
  const applicant = applicantResult as any;

  // Fetch comments
  const { result: commentsResult, query: commentsQuery } = useList({
    resource: "Comment",
    pagination: { mode: "off" },
    filters: [
      { field: "reference_doctype", operator: "eq", value: "Job Applicant" },
      { field: "reference_name", operator: "eq", value: applicantId ?? "" },
      { field: "comment_type", operator: "eq", value: "Comment" },
    ],
    sorters: [{ field: "creation", order: "asc" }],
    meta: { fields: ["name", "content", "owner", "creation"] },
    queryOptions: { enabled: !!applicantId },
  });
  const comments = commentsResult?.data ?? [];

  // Fetch employees for @mention (only those with a user_id can receive notifications)
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    meta: { fields: ["name", "employee_name", "user_id"] },
  });
  const employees = employeesResult?.data ?? [];

  const mentionUsers = useMemo(
    () =>
      employees
        .filter((e: any) => !!e.user_id)
        .map((e: any) => ({ id: e.user_id, display: e.employee_name ?? e.name })),
    [employees]
  );

  const { mutateAsync: createComment } = useCreate();
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const { mutateAsync: updateApplicant } = useUpdate();
  const invalidate = useInvalidate();

  // Fetch available tags and applicant tags
  useEffect(() => {
    fetch("/inquiry-api/applicants/available-tags")
      .then((r) => r.json())
      .then((data) => setAvailableTags(data?.tags ?? data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!applicantId) return;
    setApplicantTags([]);
    fetch(`/inquiry-api/applicants/${applicantId}/tags`)
      .then((r) => r.json())
      .then((data) => setApplicantTags(data?.tags ?? data ?? []))
      .catch(() => {});
  }, [applicantId]);

  // Reset comment when switching applicants
  useEffect(() => {
    setCommentValue("");
  }, [applicantId]);

  function goToPrev() {
    if (currentIdx > 0) onNavigate(screeningItems[currentIdx - 1].id);
  }

  function goToNext() {
    if (currentIdx < screeningItems.length - 1) onNavigate(screeningItems[currentIdx + 1].id);
  }

  async function handleReject() {
    if (!window.confirm("Move this applicant to Rejected?")) return;
    await updateApplicant({
      resource: "Job Applicant",
      id: applicantId!,
      values: { custom_recruiting_stage: "Rejected" },
    });
    invalidate({ resource: "Job Applicant", invalidates: ["list"] });
    const idx = screeningItems.findIndex((i) => i.id === applicantId);
    const next = screeningItems[idx + 1] ?? screeningItems[idx - 1];
    next ? onNavigate(next.id) : onClose();
  }

  async function handleAddComment() {
    if (!commentValue.trim() || !applicantId) return;
    setIsCreatingComment(true);
    try {
      await createComment({
        resource: "Comment",
        values: {
          reference_doctype: "Job Applicant",
          reference_name: applicantId,
          comment_type: "Comment",
          content: toFrappeHTML(commentValue),
        },
      });
      setCommentValue("");
      commentsQuery?.refetch?.();
    } finally {
      setIsCreatingComment(false);
    }
  }

  async function handleAddTag(tag: string) {
    if (!applicantId || applicantTags.includes(tag)) return;
    await fetch(`/inquiry-api/applicants/${applicantId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    setApplicantTags((prev) => [...prev, tag]);
    if (!availableTags.includes(tag)) setAvailableTags((prev) => [...prev, tag]);
    setTagPopoverOpen(false);
    setTagSearch("");
  }

  async function handleRemoveTag(tag: string) {
    if (!applicantId) return;
    await fetch(
      `/inquiry-api/applicants/${applicantId}/tags?tag=${encodeURIComponent(tag)}`,
      { method: "DELETE" }
    );
    setApplicantTags((prev) => prev.filter((t) => t !== tag));
  }

  const resumeUrl = applicant?.resume_attachment
    ? applicant.resume_attachment.startsWith("/")
      ? applicant.resume_attachment
      : `/${applicant.resume_attachment}`
    : null;

  return (
    <Sheet open={!!applicantId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrev}
                disabled={currentIdx <= 0}
                className="h-7 w-7"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {currentIdx + 1} / {screeningItems.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNext}
                disabled={currentIdx >= screeningItems.length - 1}
                className="h-7 w-7"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <h2 className="font-semibold leading-tight">
                {applicant?.applicant_name ?? "Loading..."}
              </h2>
              {applicant?.job_title && (
                <p className="text-xs text-muted-foreground">{applicant.job_title}</p>
              )}
            </div>
          </div>
          {/* Close button provided by SheetContent */}
        </div>

        {/* Scrollable body */}
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">

            {/* Contact */}
            <section>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Contact
              </p>
              <div className="space-y-1.5">
                {applicant?.email_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={`mailto:${applicant.email_id}`}
                      className="text-primary hover:underline truncate"
                    >
                      {applicant.email_id}
                    </a>
                  </div>
                )}
                {applicant?.phone_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{applicant.phone_number}</span>
                  </div>
                )}
                {!!applicant?.custom_linkedin_url && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={applicant.custom_linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate"
                    >
                      {applicant.custom_linkedin_url}
                    </a>
                  </div>
                )}
              </div>
            </section>

            {/* Resume */}
            {resumeUrl && (
              <>
                <Separator />
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Resume
                  </p>
                  <a
                    href={resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download CV
                  </a>
                </section>
              </>
            )}

            {/* Education */}
            {(applicant?.custom_education_degree ||
              applicant?.custom_education_institution ||
              applicant?.custom_education_graduation_year) && (
              <>
                <Separator />
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Education
                  </p>
                  <div className="flex items-start gap-2 text-sm">
                    <GraduationCap className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      {applicant?.custom_education_degree && (
                        <div className="font-medium">{applicant.custom_education_degree}</div>
                      )}
                      {applicant?.custom_education_institution && (
                        <div className="text-muted-foreground">{applicant.custom_education_institution}</div>
                      )}
                      {applicant?.custom_education_graduation_year && (
                        <div className="text-xs text-muted-foreground">
                          {applicant.custom_education_graduation_year}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* Work Experience */}
            {applicant?.custom_work_experience && (
              <>
                <Separator />
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Experience
                  </p>
                  <div className="flex items-start gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {applicant.custom_work_experience}
                    </p>
                  </div>
                </section>
              </>
            )}

            {/* Cover Letter */}
            {applicant?.cover_letter && (
              <>
                <Separator />
                <section>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Cover Letter
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {applicant.cover_letter}
                  </p>
                </section>
              </>
            )}

            {/* Tags */}
            <Separator />
            <section>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Tags
              </p>
              <div className="flex items-center flex-wrap gap-1.5">
                {applicantTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                      <Plus className="h-3 w-3" /> Add Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search tags..."
                        value={tagSearch}
                        onValueChange={setTagSearch}
                      />
                      <CommandList>
                        <CommandEmpty className="p-0">
                          {tagSearch ? (
                            <button
                              className="w-full px-3 py-2 text-sm text-left hover:bg-accent cursor-pointer"
                              onMouseDown={(e) => { e.preventDefault(); handleAddTag(tagSearch); }}
                            >
                              Create &ldquo;{tagSearch}&rdquo;
                            </button>
                          ) : (
                            <span className="block px-3 py-2 text-xs text-muted-foreground">No tags</span>
                          )}
                        </CommandEmpty>
                        {availableTags
                          .filter(
                            (t) =>
                              !applicantTags.includes(t) &&
                              (!tagSearch || t.toLowerCase().includes(tagSearch.toLowerCase()))
                          )
                          .map((tag) => (
                            <CommandItem
                              key={tag}
                              value={tag}
                              onSelect={() => handleAddTag(tag)}
                            >
                              {tag}
                            </CommandItem>
                          ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </section>

            {/* Comments */}
            <Separator />
            <section>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Comments
              </p>
              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground">No comments yet.</p>
                )}
                {comments.map((comment: any) => (
                  <div key={comment.name} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{comment.owner}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatCommentDate(comment.creation)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">
                      {renderCommentContent(comment.content)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Add comment */}
              <div className="mt-4 space-y-2">
                <MentionsInput
                  value={commentValue}
                  onChange={(e) => setCommentValue(e.target.value)}
                  placeholder="Add a comment... type @ to mention"
                  style={mentionInputStyle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                >
                  <Mention
                    trigger="@"
                    markup="@[__display__](__id__)"
                    data={mentionUsers}
                    displayTransform={(_id, display) => `@${display}`}
                    renderSuggestion={(s, _search, _highlight, _idx, focused) => (
                      <div
                        style={{
                          padding: "6px 12px",
                          fontSize: "14px",
                          cursor: "pointer",
                          backgroundColor: focused ? "hsl(var(--accent))" : "transparent",
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{s.display}</span>
                      </div>
                    )}
                    style={{ backgroundColor: "hsl(var(--primary) / 0.1)", borderRadius: "3px" }}
                    appendSpaceOnAdd
                  />
                </MentionsInput>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    disabled={!commentValue.trim() || isCreatingComment}
                  >
                    Add Comment
                  </Button>
                </div>
              </div>
            </section>

          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t shrink-0">
          <Button variant="destructive" size="sm" onClick={handleReject}>
            <Ban className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
