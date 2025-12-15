import { Component, OnDestroy, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PostsService } from '../../core/services/posts';
import { Post } from '../../core/models/post.model';
import { AuthStore } from '../../core/store/auth.store';
import { ProfilesService } from '../../core/services/profiles';
import { MessagingService } from '../../core/services/messaging';
import { Services } from '../../core/services/services';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-posts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './posts.html',
  styleUrl: './posts.css',
})
export default class PostsPage implements OnInit, OnDestroy, AfterViewInit {
  posts: Post[] = [];
  loading = true;
  loadingMore = false;
  hasMore = true;
  error = '';

  newPostBody = '';
  newPostAddress = '';
  newPostPhone = '';
  attachments: { file: File; preview: string }[] = [];
  creating = false;
  currentUid: string | null = null;
  currentAuthorLabel = '';
  showComposer = false;
  editingPostId: string | null = null;
  editBody = '';
  editAddress = '';
  editPhone = '';
  serviceOptions: { id: string; title: string; category: string }[] = [];
  categories: string[] = [];
  selectedCategory = '';
  selectedServiceId = '';
  hasServices = true;
  private lastPublishAt = 0;
  private readonly publishCooldownMs = 20_000;

  private cursor: any | null = null;
  private authSub?: Subscription;
  private observer?: IntersectionObserver;
  @ViewChild('infiniteAnchor', { static: false }) infiniteAnchor?: ElementRef<HTMLDivElement>;

  private maxActivePosts = 3;
  userActivePosts = 0;

  constructor(
    private postsService: PostsService,
    private auth: AuthStore,
    private profiles: ProfilesService,
    private messaging: MessagingService,
    private servicesApi: Services,
    private router: Router,
  ) {}

  ngOnInit() {
    this.authSub = this.auth.user$.subscribe(user => {
      this.currentUid = user?.uid ?? null;
      this.currentAuthorLabel = this.buildAuthorLabel(user);
    });
    void this.loadUserPostCount();
    void this.loadServiceOptions();
    void this.loadInitial();
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
    this.observer?.disconnect();
  }

  ngAfterViewInit() {
    this.setupObserver();
  }

  async loadInitial() {
    this.loading = true;
    this.error = '';
    try {
      const { posts, cursor } = await this.postsService.listPosts(PAGE_SIZE);
      this.posts = posts;
      this.cursor = cursor;
      this.hasMore = posts.length === PAGE_SIZE;
      await this.hydrateAuthors(posts);
      await this.hydrateLikes(posts);
    } catch (error) {
      console.error('Unable to load posts', error);
      this.error = 'Impossible de charger les publications pour le moment.';
    } finally {
      this.loading = false;
    }
  }

  async loadMore() {
    if (!this.hasMore || this.loadingMore) return;
    this.loadingMore = true;
    try {
      const { posts, cursor } = await this.postsService.listPosts(PAGE_SIZE, this.cursor);
      this.cursor = cursor;
      this.hasMore = posts.length === PAGE_SIZE;
      this.posts = [...this.posts, ...posts];
      await this.hydrateAuthors(posts);
      await this.hydrateLikes(posts);
    } catch (error) {
      console.error('Unable to load more posts', error);
    } finally {
      this.loadingMore = false;
    }
  }

  async createPost() {
    if (!this.currentUid) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/publications' } });
      return;
    }
    if (this.userActivePosts >= this.maxActivePosts) {
      this.error = `Limite atteinte : maximum ${this.maxActivePosts} publications actives. Supprime ou modifie un post existant avant de publier.`;
      return;
    }
    if (!this.hasServices) {
      this.error = 'Ajoute d’abord un service pour pouvoir publier un besoin.';
      return;
    }
    if (Date.now() - this.lastPublishAt < this.publishCooldownMs) {
      this.error = 'Patiente quelques secondes avant de publier un nouveau besoin.';
      return;
    }
    const selectedService = this.serviceOptions.find(opt => opt.id === this.selectedServiceId);
    if (!selectedService) {
      this.error = 'Choisis une categorie et un titre de service.';
      return;
    }
    const body = this.newPostBody.trim();
    const address = this.newPostAddress.trim();
    const phone = this.newPostPhone.trim();
    if (!body) return;
    if (body.length > 500) {
      this.error = 'Le message est trop long (500 caracteres max).';
      return;
    }
    if (!address) {
      this.error = 'Ajoute une adresse pour que les voisins puissent venir.';
      return;
    }
    if (!phone || phone.replace(/\D/g, '').length < 6) {
      this.error = 'Ajoute un numero de telephone valide.';
      return;
    }
    this.creating = true;
    this.error = '';
    try {
      const mediaUrls = this.attachments.length
        ? await this.postsService.uploadImages(
            this.attachments.map(item => item.file),
            this.currentUid,
          )
        : [];
      const created = await this.postsService.createPost({
        body,
        address,
        phone,
        mediaUrls,
        category: selectedService.category,
        serviceTitle: selectedService.title,
        serviceId: selectedService.id,
      });
      created.author = this.buildAuthorFromCurrent();
      created.likedByUser = false;
      this.posts = [created, ...this.posts];
      this.newPostBody = '';
      this.newPostAddress = '';
      this.newPostPhone = '';
      this.attachments = [];
      this.selectedCategory = '';
      this.selectedServiceId = '';
      this.lastPublishAt = Date.now();
    } catch (err) {
      console.error('Unable to publish', err);
      this.error = 'Impossible de publier pour le moment.';
    } finally {
      this.creating = false;
    }
  }

  async toggleLike(post: Post) {
    if (!this.currentUid) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/publications' } });
      return;
    }
    const nextState = !post.likedByUser;
    post.likedByUser = nextState;
    post.likeCount = Math.max(0, (post.likeCount ?? 0) + (nextState ? 1 : -1));
    try {
      await this.postsService.toggleLike(post.id, this.currentUid, nextState);
    } catch (error) {
      console.error('Unable to toggle like', error);
      post.likedByUser = !nextState;
      post.likeCount = Math.max(0, (post.likeCount ?? 0) + (nextState ? -1 : 1));
    }
  }

  trackByPostId(_index: number, post: Post) {
    return post.id;
  }

  isOwner(post: Post) {
    return this.currentUid && post.authorId === this.currentUid;
  }

  startEdit(post: Post) {
    if (!this.isOwner(post)) return;
    this.editingPostId = post.id;
    this.editBody = post.body;
    this.editAddress = post.address || '';
    this.editPhone = post.phone || '';
  }

  cancelEdit() {
    this.editingPostId = null;
    this.editBody = '';
    this.editAddress = '';
    this.editPhone = '';
  }

  async saveEdit(post: Post) {
    if (!this.editingPostId || this.editingPostId !== post.id) return;
    const body = this.editBody.trim();
    if (!body) {
      this.error = 'Le message ne peut pas etre vide.';
      return;
    }
    if (!this.editAddress.trim()) {
      this.error = 'Ajoute une adresse pour que les voisins puissent venir.';
      return;
    }
    if (!this.editPhone.trim()) {
      this.error = 'Ajoute un numero de telephone valide.';
      return;
    }
    try {
      await this.postsService.updatePost(post.id, {
        body,
        address: this.editAddress,
        phone: this.editPhone,
      });
      this.posts = this.posts.map(p =>
        p.id === post.id
          ? {
              ...p,
              body,
              address: this.editAddress,
              phone: this.editPhone,
            }
          : p,
      );
      this.cancelEdit();
    } catch (error) {
      console.error('Unable to update post', error);
      this.error = 'Impossible de modifier cette publication.';
    }
  }

  async deletePost(post: Post) {
    if (!this.isOwner(post)) return;
    const confirmDelete = typeof window !== 'undefined'
      ? window.confirm('Supprimer cette publication ?')
      : true;
    if (!confirmDelete) return;
    try {
      await this.postsService.deletePost(post.id);
      this.posts = this.posts.filter(p => p.id !== post.id);
    } catch (error) {
      console.error('Unable to delete post', error);
      this.error = 'Impossible de supprimer pour le moment.';
    }
  }

  async contactAuthor(post: Post) {
    if (!this.currentUid) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/publications' } });
      return;
    }
    if (post.authorId === this.currentUid) return;
    try {
      const conversationId = await this.messaging.ensureConversation(post.authorId);
      if (conversationId) {
        const context = `Je reponds a ton besoin: "${post.body.slice(0, 180)}" (adresse: ${post.address || 'non renseignee'}).`;
        await this.messaging.sendMessage(conversationId, context);
        this.router.navigate(['/messagerie', conversationId]);
      }
    } catch (error) {
      console.error('Unable to contact author', error);
      this.error = 'Impossible de contacter l\'auteur pour le moment.';
    }
  }

  formatDate(timestamp?: number) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  authorName(post: Post) {
    const author = post.author;
    if (!author) return 'Utilisateur';
    if (author.pseudo) return author.pseudo;
    const parts = [author.firstname, author.lastname].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Utilisateur';
  }

  private buildAuthorLabel(user: any) {
    if (!user) return '';
    if (user.pseudo) return user.pseudo;
    const parts = [user.firstname, user.lastname].filter(Boolean);
    return parts.join(' ');
  }

  onCategoryChange(value: string) {
    this.selectedCategory = value;
    const first = this.filteredServiceOptions()[0];
    this.selectedServiceId = first ? first.id : '';
  }

  filteredServiceOptions() {
    if (!this.selectedCategory) return this.serviceOptions;
    return this.serviceOptions.filter(opt => opt.category === this.selectedCategory);
  }

  private buildAuthorFromCurrent() {
    const profile = this.auth.user$.value as any;
    if (!profile) return undefined;
    return {
      pseudo: profile.pseudo || undefined,
      firstname: profile.firstname || undefined,
      lastname: profile.lastname || undefined,
      photoURL: profile.photoURL || undefined,
      city: profile?.city || undefined,
      profession: profile?.profession || undefined,
    };
  }

  onFilesSelected(event: any) {
    const files: FileList | undefined = event?.target?.files;
    if (!files?.length) return;
    const remaining = Math.max(0, 2 - this.attachments.length);
    const selection = Array.from(files).slice(0, remaining);
    selection.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const preview = (e.target?.result as string) || '';
        this.attachments = [...this.attachments, { file, preview }];
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  }

  removeAttachment(index: number) {
    this.attachments = this.attachments.filter((_, i) => i !== index);
  }

  private async loadServiceOptions() {
    try {
      const services = await this.servicesApi.list();
      this.serviceOptions = services
        .map(service => ({
          id: service.id ?? '',
          title: service.title,
          category: service.category ?? 'Autre',
        }))
        .filter(opt => opt.id && opt.title);
      this.categories = Array.from(new Set(this.serviceOptions.map(opt => opt.category)));
      this.hasServices = this.serviceOptions.length > 0;
      const first = this.serviceOptions[0];
      if (first) {
        this.selectedCategory = first.category;
        this.selectedServiceId = first.id;
      } else {
        this.selectedCategory = '';
        this.selectedServiceId = '';
      }
    } catch (error) {
      console.warn('Unable to load services for posts', error);
      this.hasServices = false;
    }
  }

  private async loadUserPostCount() {
    if (!this.currentUid) {
      this.userActivePosts = 0;
      return;
    }
    // Utilise le feed courant comme approximation : compte les posts de l'utilisateur dans la liste chargée.
    // Pour plus de precision il faudrait une requete Firestore filtrée, non disponible ici sans backend.
    const count = this.posts.filter(p => p.authorId === this.currentUid).length;
    this.userActivePosts = count;
  }

  toggleComposer() {
    this.showComposer = !this.showComposer;
  }

  private setupObserver() {
    if (!this.infiniteAnchor) return;
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && this.hasMore && !this.loadingMore && !this.loading) {
            void this.loadMore();
          }
        });
      },
      { root: null, rootMargin: '200px' },
    );
    this.observer.observe(this.infiniteAnchor.nativeElement);
  }

  private async hydrateAuthors(posts: Post[]) {
    const ids = Array.from(new Set(posts.map(p => p.authorId).filter(Boolean)));
    if (!ids.length) return;
    try {
      const profiles = await this.profiles.getProfilesByIds(ids);
      this.posts = this.posts.map(post => ({
        ...post,
        author: profiles[post.authorId] || post.author,
      }));
    } catch (error) {
      console.warn('Unable to hydrate post authors', error);
    }
  }

  private async hydrateLikes(posts: Post[]) {
    if (!this.currentUid || !posts.length) return;
    await Promise.all(
      posts.map(async post => {
        try {
          const liked = await this.postsService.hasUserLiked(post.id, this.currentUid!);
          this.posts = this.posts.map(p =>
            p.id === post.id ? { ...p, likedByUser: liked } : p,
          );
        } catch (error) {
          console.warn('Unable to load like state', error);
        }
      }),
    );
  }
}
