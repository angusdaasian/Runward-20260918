import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";
import BlogManager from "@/components/admin/BlogManager";

const BlogAdmin = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center">
        <p className="text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Admins only</h1>
          <p className="mt-2 text-muted-foreground">
            You need an admin account to manage blog posts.
          </p>
          <Link to="/blog" className="mt-4 inline-block text-primary hover:underline">
            Back to the blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <header className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <button
            onClick={() => navigate("/admin?tab=blog")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Admin panel
          </button>
          <span className="text-sm text-muted-foreground">Blog admin</span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <BlogManager />
      </main>
    </div>
  );
};

export default BlogAdmin;
