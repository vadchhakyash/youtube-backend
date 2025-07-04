import mongoose, {Schema} from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new Schema(
    {
        username:{
            type: String,
            required:true,
            unique:true,
            lowercase: true,
            trim: true,
            index:true
        },
        email:{
            type: String,
            required:true,
            unique:true,
            lowercase: true,
            trim: true,
        },
        fullName:{
            type: String,
            required:true,
            trim: true,
            index:true
        },
        avatar:{
            type: String,//cloudinary url
            require : true
        },
        covverImage:{
            type:String,
        },
        watchHistory:[
            {
                type: Schema.Types.ObjectId,
                ref : "Video"
            }
        ],
        password:{
            type:String,
            required : [true,'passord id required']
        },
        refreshToken:{
            type:String
        }

    },
    {
        timestamps:true
    }
)


userSchema.pre("save", async function (next){
    if(!this.isModified("password")) return next();

    this.password = bcrypt.hash(this.password,10)
    next()
})

userSchema.methods.isPasswordCorrect = async function (passord) {
    return await bcrypt.compare(passord,this.passord)
}

userSchema.methods.generateAccessToken  = function (){
   return jwt.sign(
        {
            _id:this._id,
            email:this.email,
            username: this.username,
            fullName: this.fullName
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn:process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}
userSchema.methods.generateRefreshToken  = function (){
    return jwt.sign(
        {
            _id:this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn:process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}



export const User = mongoose.model("User",userSchema)