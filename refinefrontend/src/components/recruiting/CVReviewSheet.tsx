import { useState, useEffect, useRef } from "react";
import {
  useOne,
  useList,
  useCreate,
  useUpdate,
  useInvalidate,
} from "@refinedev/core";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

function renderCommentContent(content: string) {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="text-primary font-medium">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function CVReviewSheet({
  applicantId,
  screeningItems,
  onClose,
  onNavigate,
}: CVReviewSheetProps) {
  const [commentText, setCommentText] = useState("");
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [applicantTags, setApplicantTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Fetch employees for @mention
  const { result: employeesResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    meta: { fields: ["name", "employee_name"] },
  });
  const employees = employeesResult?.data ?? [];

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
    setCommentText("");
    setMentionSearch(null);
    setMentionPopoverOpen(false);
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
    if (!commentText.trim() || !applicantId) return;
    setIsCreatingComment(true);
    try {
      await createComment({
        resource: "Comment",
        values: {
          reference_doctype: "Job Applicant",
          reference_name: applicantId,
          comment_type: "Comment",
          content: commentText.trim(),
        },
      });
      setCommentText("");
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

  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setCommentText(value);

    // Detect @mention: find the word under cursor
    const cursorPos = e.target.selectionStart ?? value.length;
    const textUpToCursor = value.slice(0, cursorPos);
    const match = textUpToCursor.match(/@(\w*)$/);
    if (match) {
      setMentionSearch(match[1]);
      setMentionPopoverOpen(true);
    } else {
      setMentionSearch(null);
      setMentionPopoverOpen(false);
    }
  }

  function handleMentionSelect(employeeName: string) {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart ?? commentText.length;
    const textUpToCursor = commentText.slice(0, cursorPos);
    const textAfterCursor = commentText.slice(cursorPos);
    // Replace @partial with @EmployeeName
    const replaced = textUpToCursor.replace(/@(\w*)$/, `@${employeeName} `);
    setCommentText(replaced + textAfterCursor);
    setMentionSearch(null);
    setMentionPopoverOpen(false);
    // Restore focus
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const filteredEmployees = employees.filter((emp: any) => {
    if (!mentionSearch) return true;
    return (emp.employee_name ?? emp.name)
      .toLowerCase()
      .includes(mentionSearch.toLowerCase());
  });

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
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
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
                        <CommandEmpty>
                          {tagSearch ? (
                            <button
                              className="w-full px-3 py-2 text-sm text-left hover:bg-accent"
                              onClick={() => handleAddTag(tagSearch)}
                            >
                              Create "{tagSearch}"
                            </button>
                          ) : (
                            <span className="px-3 py-2 text-xs text-muted-foreground">No tags</span>
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
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    placeholder="Add a comment... type @ to mention"
                    value={commentText}
                    onChange={handleCommentChange}
                    rows={3}
                    className="text-sm resize-none"
                  />
                  {mentionPopoverOpen && filteredEmployees.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 z-50 w-56 rounded-md border bg-popover shadow-md">
                      <Command>
                        <CommandList>
                          {filteredEmployees.slice(0, 8).map((emp: any) => (
                            <CommandItem
                              key={emp.name}
                              value={emp.employee_name ?? emp.name}
                              onSelect={() => handleMentionSelect(emp.employee_name ?? emp.name)}
                              className="cursor-pointer"
                            >
                              {emp.employee_name ?? emp.name}
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || isCreatingComment}
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
